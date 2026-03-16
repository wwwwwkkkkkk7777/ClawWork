import { access, readFile } from "node:fs/promises";
import path from "node:path";

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

  throw new Error(`file not found: ${filePath}`);
}

export async function parseFile(filePath: string) {
  const resolvedPath = await resolveReadablePath(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === ".md" || ext === ".txt") {
    return { text: await readFile(resolvedPath, "utf8") };
  }

  throw new Error(`unsupported file type: ${ext}`);
}
