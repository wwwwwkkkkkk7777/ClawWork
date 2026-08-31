import { createParserServer } from "./server";

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function bootstrap() {
  const internalToken = process.env.FILE_PARSER_INTERNAL_TOKEN;
  if (process.env.NODE_ENV === "production" && (!internalToken || internalToken.length < 24)) {
    throw new Error("FILE_PARSER_INTERNAL_TOKEN with at least 24 characters is required in production");
  }

  const server = await createParserServer({
    host: "0.0.0.0",
    port: parsePositiveInteger(process.env.PORT, 3003),
    internalToken,
    maxFileBytes: parsePositiveInteger(process.env.MAX_PARSE_FILE_BYTES, 25 * 1024 * 1024),
    maxExtractedChars: parsePositiveInteger(
      process.env.MAX_EXTRACTED_TEXT_CHARS,
      1_000_000
    ),
    timeoutMs: parsePositiveInteger(process.env.FILE_PARSE_TIMEOUT_MS, 15_000)
  });

  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      service: "file-parser-worker",
      event: "service_started",
      url: server.url
    })
  );
}

void bootstrap().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      service: "file-parser-worker",
      event: "bootstrap_failed",
      message: error instanceof Error ? error.message : "parser failed to start"
    })
  );
  process.exitCode = 1;
});
