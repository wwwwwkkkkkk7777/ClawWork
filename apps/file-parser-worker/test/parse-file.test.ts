import { describe, expect, it } from "vitest";
import { parseFile } from "../src/parse-file";

describe("parseFile", () => {
  it("extracts markdown text", async () => {
    const result = await parseFile("apps/file-parser-worker/test/fixtures/sample.md");

    expect(result.text).toContain("Weekly summary");
  });
});
