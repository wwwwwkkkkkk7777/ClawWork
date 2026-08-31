import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import type { FileRecord } from "@clawwork/shared-types";

export type GatewayTaskFile = Pick<
  FileRecord,
  "fileId" | "filename" | "mimeType" | "sizeBytes" | "storageKey"
> & {
  contentUrl?: string;
  contentPath?: string;
};

export type GatewayAttachment = {
  type: "file" | "image";
  mimeType: string;
  fileName: string;
  content: string;
};

export type PreparedGatewayInput = {
  message: string;
  attachments: GatewayAttachment[];
};

const MAX_DOCUMENT_CHARS_PER_FILE = 6_000;
const MAX_DOCUMENT_CHARS_TOTAL = 16_000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

type ParseFileErrorCode =
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "PARSE_FAILED"
  | "UNSUPPORTED_FILE_TYPE";

class ParseFileError extends Error {
  constructor(readonly code: ParseFileErrorCode, message: string) {
    super(message);
    this.name = "ParseFileError";
  }
}

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

function truncateText(text: string, maxChars: number) {
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxChars - 18)).trimEnd()}\n...[truncated]...`;
}

function formatFallbackDocumentNote(file: GatewayTaskFile, error: ParseFileError) {
  if (error.code === "UNSUPPORTED_FILE_TYPE") {
    return [
      `The user attached ${file.filename} (${file.mimeType}).`,
      "Readable text extraction is not supported for this format yet.",
      "Use the file metadata in your response or ask the user to re-upload as PDF, DOCX, XLSX, CSV, TXT, or Markdown if exact contents are needed."
    ].join(" ");
  }

  return [
    `The user attached ${file.filename} (${file.mimeType}).`,
    `Readable text extraction failed locally: ${error.message}.`,
    "Use the file metadata in your response and ask for a different format if exact contents are needed."
  ].join(" ");
}

function buildDocumentBlock(index: number, file: GatewayTaskFile, content: string) {
  return [
    `<attached_document index="${index}">`,
    `fileName: ${file.filename}`,
    `mimeType: ${file.mimeType}`,
    `sizeBytes: ${file.sizeBytes}`,
    "content:",
    content,
    "</attached_document>"
  ].join("\n");
}

async function toImageAttachment(file: GatewayTaskFile): Promise<GatewayAttachment> {
  const content = await loadFile(file);
  return {
    type: "image",
    mimeType: file.mimeType,
    fileName: file.filename,
    content: content.toString("base64")
  };
}

async function loadFile(file: GatewayTaskFile) {
  if (file.sizeBytes > MAX_FILE_BYTES) {
    throw new Error(`file ${file.filename} exceeds the adapter size limit`);
  }
  if (file.contentUrl) {
    const response = await fetch(file.contentUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`object download failed (${response.status})`);
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_BYTES) {
      throw new Error(`file ${file.filename} exceeds the adapter size limit`);
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (content.length > MAX_FILE_BYTES || content.length !== file.sizeBytes) {
      throw new Error(`downloaded size for ${file.filename} does not match metadata`);
    }
    return content;
  }
  if (file.contentPath) {
    const content = await readFile(file.contentPath);
    if (content.length > MAX_FILE_BYTES || content.length !== file.sizeBytes) {
      throw new Error(`local size for ${file.filename} does not match metadata`);
    }
    return content;
  }
  throw new Error(`file ${file.filename} has no readable content source`);
}

function isParserErrorCode(value: unknown): value is ParseFileErrorCode {
  return (
    value === "FILE_NOT_FOUND" ||
    value === "FILE_TOO_LARGE" ||
    value === "PARSE_FAILED" ||
    value === "UNSUPPORTED_FILE_TYPE"
  );
}

async function parseWithIsolatedService(file: GatewayTaskFile) {
  const parserUrl = process.env.FILE_PARSER_URL ?? "http://127.0.0.1:3003";
  const extension = extname(file.filename).toLowerCase().slice(0, 12);
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-File-Extension": extension
  };
  if (process.env.FILE_PARSER_INTERNAL_TOKEN) {
    headers.Authorization = `Bearer ${process.env.FILE_PARSER_INTERNAL_TOKEN}`;
  }

  let response: Response;
  try {
    response = await fetch(new URL("/parse", parserUrl), {
      method: "POST",
      headers,
      body: await loadFile(file),
      signal: AbortSignal.timeout(
        Number(process.env.FILE_PARSE_CLIENT_TIMEOUT_MS ?? 20_000)
      )
    });
  } catch (error) {
    throw new Error(
      `isolated parser request failed: ${error instanceof Error ? error.message : "network error"}`
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; text?: unknown; code?: unknown; message?: unknown }
    | null;
  if (!response.ok || payload?.ok === false) {
    const code = isParserErrorCode(payload?.code) ? payload.code : "PARSE_FAILED";
    const message =
      typeof payload?.message === "string"
        ? payload.message
        : `parser service failed with status ${response.status}`;
    throw new ParseFileError(code, message);
  }
  if (typeof payload?.text !== "string") {
    throw new Error("isolated parser returned an invalid response");
  }
  return { text: payload.text };
}

async function toDocumentBlock(
  file: GatewayTaskFile,
  index: number,
  remainingChars: number
) {
  const budget = Math.max(256, Math.min(MAX_DOCUMENT_CHARS_PER_FILE, remainingChars));

  try {
    const parsed = await parseWithIsolatedService(file);
    return {
      block: buildDocumentBlock(index, file, truncateText(parsed.text, budget)),
      charsUsed: Math.min(parsed.text.length, budget)
    };
  } catch (error) {
    if (error instanceof ParseFileError && error.code !== "FILE_NOT_FOUND") {
      const fallback = formatFallbackDocumentNote(file, error);
      return {
        block: buildDocumentBlock(index, file, truncateText(fallback, budget)),
        charsUsed: Math.min(fallback.length, budget)
      };
    }

    throw error;
  }
}

function mergeMessageWithDocumentBlocks(message: string, documentBlocks: string[]) {
  if (documentBlocks.length === 0) {
    return message;
  }

  const trimmedMessage = message.trim();
  const documentSection = [
    "Attached document context follows. These files are part of the user's request.",
    ...documentBlocks
  ].join("\n\n");

  return trimmedMessage ? `${trimmedMessage}\n\n${documentSection}` : documentSection;
}

export async function prepareGatewayInput(
  message: string,
  files: GatewayTaskFile[] | undefined
): Promise<PreparedGatewayInput> {
  const attachments: GatewayAttachment[] = [];
  const documentBlocks: string[] = [];
  let remainingChars = MAX_DOCUMENT_CHARS_TOTAL;

  for (const [index, file] of (files ?? []).entries()) {
    if (isImageMime(file.mimeType)) {
      attachments.push(await toImageAttachment(file));
      continue;
    }

    if (remainingChars <= 0) {
      documentBlocks.push(
        buildDocumentBlock(
          index + 1,
          file,
          `The user attached ${file.filename} (${file.mimeType}), but local document context was truncated because the request already includes too much extracted content.`
        )
      );
      continue;
    }

    const documentBlock = await toDocumentBlock(file, index + 1, remainingChars);
    documentBlocks.push(documentBlock.block);
    remainingChars = Math.max(0, remainingChars - documentBlock.charsUsed);
  }

  return {
    message: mergeMessageWithDocumentBlocks(message, documentBlocks),
    attachments
  };
}
