import { spawn } from "node:child_process";
import { timingSafeEqual, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const ALLOWED_EXTENSIONS = new Set([".csv", ".docx", ".md", ".pdf", ".txt", ".xlsx"]);

type ChildResponse =
  | { ok: true; text: string }
  | { ok: false; code: string; message: string };

export type ParserServerOptions = {
  host?: string;
  port?: number;
  internalToken?: string;
  maxFileBytes?: number;
  maxExtractedChars?: number;
  timeoutMs?: number;
};

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function tokenMatches(request: IncomingMessage, expectedToken: string | undefined) {
  if (!expectedToken) return true;
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBoundedBody(request: IncomingMessage, maxBytes: number) {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw Object.assign(new Error("file exceeds parser size limit"), { statusCode: 413 });
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw Object.assign(new Error("file exceeds parser size limit"), { statusCode: 413 });
    }
    chunks.push(buffer);
  }

  if (totalBytes === 0) {
    throw Object.assign(new Error("empty file body"), { statusCode: 400 });
  }
  return Buffer.concat(chunks, totalBytes);
}

function parseInChild(
  filePath: string,
  timeoutMs: number,
  maxExtractedChars: number,
  maxOutputBytes: number
) {
  return new Promise<ChildResponse>((resolve, reject) => {
    const childScript = join(__dirname, "parse-child.ts");
    const child = spawn(
      process.execPath,
      ["--max-old-space-size=384", "--import", "tsx", childScript, filePath],
      {
        env: {
          ...process.env,
          MAX_EXTRACTED_TEXT_CHARS: String(maxExtractedChars)
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;

    const finish = (error?: Error, result?: ChildResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else if (result) resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`file parsing exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error("parser output exceeded the configured limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (Buffer.concat(stderr).length < 16_384) stderr.push(chunk);
    });
    child.once("error", (error) => finish(error));
    child.once("close", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(stdout).toString("utf8")) as ChildResponse;
        if (!parsed || typeof parsed !== "object" || typeof parsed.ok !== "boolean") {
          throw new Error("parser child returned an invalid response");
        }
        finish(undefined, parsed);
      } catch {
        const detail = Buffer.concat(stderr).toString("utf8").trim().slice(0, 512);
        finish(new Error(detail || "parser child returned no valid response"));
      }
    });
  });
}

function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "file-parser-worker",
      event,
      ...fields
    })
  );
}

export async function createParserServer(options: ParserServerOptions = {}) {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3003;
  const maxFileBytes = positiveInteger(options.maxFileBytes, 25 * 1024 * 1024);
  const timeoutMs = positiveInteger(options.timeoutMs, 15_000);
  const maxExtractedChars = Math.min(
    positiveInteger(options.maxExtractedChars, 1_000_000),
    1_000_000
  );
  const maxOutputBytes = maxExtractedChars * 6 + 4096;
  let activeParses = 0;
  let totalParses = 0;
  let failedParses = 0;

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    if (request.method === "GET" && request.url === "/health/live") {
      return sendJson(response, 200, { status: "ok" });
    }
    if (request.method === "GET" && request.url === "/health/ready") {
      return sendJson(response, activeParses < 4 ? 200 : 503, {
        status: activeParses < 4 ? "ready" : "busy",
        activeParses
      });
    }
    if (request.method === "GET" && request.url === "/metrics") {
      response.writeHead(200, { "Content-Type": "text/plain; version=0.0.4" });
      return response.end(
        [
          "# TYPE clawwork_parser_requests_total counter",
          `clawwork_parser_requests_total ${totalParses}`,
          "# TYPE clawwork_parser_failures_total counter",
          `clawwork_parser_failures_total ${failedParses}`,
          "# TYPE clawwork_parser_active gauge",
          `clawwork_parser_active ${activeParses}`,
          ""
        ].join("\n")
      );
    }
    if (request.method !== "POST" || request.url !== "/parse") {
      return sendJson(response, 404, { code: "NOT_FOUND", message: "route not found" });
    }
    if (!tokenMatches(request, options.internalToken)) {
      return sendJson(response, 401, { code: "UNAUTHORIZED", message: "invalid parser token" });
    }
    if (activeParses >= 4) {
      return sendJson(response, 503, { code: "PARSER_BUSY", message: "parser capacity exhausted" });
    }

    const rawExtension = String(request.headers["x-file-extension"] ?? "").toLowerCase();
    const extension = rawExtension.startsWith(".") ? rawExtension : `.${rawExtension}`;
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return sendJson(response, 415, {
        code: "UNSUPPORTED_FILE_TYPE",
        message: `unsupported file type: ${extension}`
      });
    }

    activeParses += 1;
    totalParses += 1;
    const startedAt = Date.now();
    let directory: string | undefined;
    try {
      directory = await mkdtemp(join(tmpdir(), "clawwork-parser-"));
      const filePath = join(directory, `input${extension}`);
      const body = await readBoundedBody(request, maxFileBytes);
      await writeFile(filePath, body, { mode: 0o600, flag: "wx" });
      const result = await parseInChild(
        filePath,
        timeoutMs,
        maxExtractedChars,
        maxOutputBytes
      );
      if (!result.ok) {
        failedParses += 1;
        log("parse_rejected", {
          requestId,
          code: result.code,
          durationMs: Date.now() - startedAt
        });
        return sendJson(response, result.code === "UNSUPPORTED_FILE_TYPE" ? 415 : 422, result);
      }
      log("parse_completed", {
        requestId,
        inputBytes: body.length,
        outputChars: result.text.length,
        durationMs: Date.now() - startedAt
      });
      return sendJson(response, 200, result);
    } catch (error) {
      failedParses += 1;
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : 422;
      log("parse_failed", {
        requestId,
        statusCode,
        durationMs: Date.now() - startedAt
      });
      return sendJson(response, statusCode, {
        ok: false,
        code: statusCode === 413 ? "FILE_TOO_LARGE" : "PARSE_FAILED",
        message: error instanceof Error ? error.message : "file parsing failed"
      });
    } finally {
      activeParses -= 1;
      if (directory) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
  };
}
