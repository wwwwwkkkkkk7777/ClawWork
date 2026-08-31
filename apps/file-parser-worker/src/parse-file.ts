import { access, readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import readXlsxFile from "read-excel-file/node";

export type ParseFileErrorCode =
  | "FILE_NOT_FOUND"
  | "PARSE_FAILED"
  | "UNSUPPORTED_FILE_TYPE";

export class ParseFileError extends Error {
  readonly code: ParseFileErrorCode;

  constructor(code: ParseFileErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ParseFileError";
    this.code = code;
    if (options && "cause" in options) {
      Object.defineProperty(this, "cause", {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true
      });
    }
  }
}

async function resolveReadablePath(filePath: string) {
  const candidates = [
    path.resolve(process.cwd(), filePath),
    path.resolve(process.cwd(), "..", "..", filePath)
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate until one resolves on disk.
    }
  }

  throw new ParseFileError("FILE_NOT_FOUND", `file not found: ${filePath}`);
}

function normalizeExtractedText(text: string) {
  const maxExtractedChars = Number(process.env.MAX_EXTRACTED_TEXT_CHARS ?? 1_000_000);
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, Number.isSafeInteger(maxExtractedChars) && maxExtractedChars > 0 ? maxExtractedChars : 1_000_000);
}

function ensureParsedText(text: string, label: string) {
  const normalized = normalizeExtractedText(text);
  if (!normalized) {
    throw new ParseFileError("PARSE_FAILED", `no readable text extracted from ${label}`);
  }

  return { text: normalized };
}

async function parsePdfFile(resolvedPath: string) {
  const parser = new PDFParse({ data: await readFile(resolvedPath) });

  try {
    const parsed = await parser.getText();
    return ensureParsedText(parsed.text ?? "", path.basename(resolvedPath));
  } catch (error) {
    throw new ParseFileError(
      "PARSE_FAILED",
      `unable to extract pdf text from ${path.basename(resolvedPath)}`,
      { cause: error }
    );
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function parseDocxFile(resolvedPath: string) {
  try {
    const parsed = await mammoth.extractRawText({ path: resolvedPath });
    return ensureParsedText(parsed.value ?? "", path.basename(resolvedPath));
  } catch (error) {
    throw new ParseFileError(
      "PARSE_FAILED",
      `unable to extract docx text from ${path.basename(resolvedPath)}`,
      { cause: error }
    );
  }
}

function formatSpreadsheetCell(value: unknown) {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function escapeCsvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function parseSpreadsheetFile(resolvedPath: string) {
  try {
    const workbook = (await readXlsxFile(resolvedPath)).slice(0, 20);
    const sheets: string[] = [];

    for (const { sheet: sheetName, data: rows } of workbook) {
      const csv = normalizeExtractedText(
        rows
          .slice(0, 10_000)
          .map((row) =>
            row
              .slice(0, 256)
              .map((cell) => escapeCsvCell(formatSpreadsheetCell(cell)))
              .join(",")
          )
          .filter((row) => row.replace(/,/g, "").trim().length > 0)
          .join("\n")
      );

      if (csv) sheets.push(`Sheet: ${sheetName}\n${csv}`);
    }

    return ensureParsedText(sheets.join("\n\n"), path.basename(resolvedPath));
  } catch (error) {
    throw new ParseFileError(
      "PARSE_FAILED",
      `unable to extract spreadsheet text from ${path.basename(resolvedPath)}`,
      { cause: error }
    );
  }
}

export async function parseFile(filePath: string) {
  const resolvedPath = await resolveReadablePath(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === ".md" || ext === ".txt" || ext === ".csv") {
    return ensureParsedText(await readFile(resolvedPath, "utf8"), path.basename(resolvedPath));
  }

  if (ext === ".pdf") {
    return parsePdfFile(resolvedPath);
  }

  if (ext === ".docx") {
    return parseDocxFile(resolvedPath);
  }

  if (ext === ".xlsx") {
    return await parseSpreadsheetFile(resolvedPath);
  }

  throw new ParseFileError("UNSUPPORTED_FILE_TYPE", `unsupported file type: ${ext}`);
}
