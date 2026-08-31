import { ParseFileError, parseFile } from "./parse-file";

type ChildResponse =
  | { ok: true; text: string }
  | { ok: false; code: string; message: string };

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    throw new Error("parser child requires a file path");
  }

  try {
    const parsed = await parseFile(filePath);
    const response: ChildResponse = { ok: true, text: parsed.text };
    process.stdout.write(JSON.stringify(response));
  } catch (error) {
    const response: ChildResponse = {
      ok: false,
      code: error instanceof ParseFileError ? error.code : "PARSE_FAILED",
      message: error instanceof Error ? error.message : "file parsing failed"
    };
    process.stdout.write(JSON.stringify(response));
    process.exitCode = 2;
  }
}

void main().catch((error: unknown) => {
  const response: ChildResponse = {
    ok: false,
    code: "PARSE_FAILED",
    message: error instanceof Error ? error.message : "parser child failed"
  };
  process.stdout.write(JSON.stringify(response));
  process.exitCode = 1;
});
