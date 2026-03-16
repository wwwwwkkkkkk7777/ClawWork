import { parseFile } from "./parse-file";

export async function handleParseJob(filePath: string) {
  return parseFile(filePath);
}
