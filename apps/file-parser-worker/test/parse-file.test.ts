import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { parseFile } from "../src/parse-file";

let tempDir: string | undefined;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

function createTempFile(filename: string, content: Buffer | string) {
  tempDir ??= mkdtempSync(join(tmpdir(), "clawwork-file-parser-"));
  const filePath = join(tempDir, filename);
  writeFileSync(filePath, content);
  return filePath;
}

function escapePdfText(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBuffer(text: string) {
  const stream = `BT\n/F1 18 Tf\n72 120 Td\n(${escapePdfText(text)}) Tj\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

function buildXlsxBuffer() {
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      </Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets>
      </workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
      </Relationships>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Score</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c><c r="B2"><v>90</v></c></row>
        </sheetData>
      </worksheet>`
  };

  return Buffer.from(
    zipSync(Object.fromEntries(Object.entries(files).map(([name, xml]) => [name, strToU8(xml)])))
  );
}

describe("parseFile", () => {
  it("extracts markdown text", async () => {
    const result = await parseFile("apps/file-parser-worker/test/fixtures/sample.md");

    expect(result.text).toContain("Weekly summary");
  });

  it("extracts pdf text", async () => {
    const result = await parseFile(createTempFile("summary.pdf", buildPdfBuffer("Quarterly summary")));

    expect(result.text).toContain("Quarterly summary");
  });

  it("extracts spreadsheet text", async () => {
    const result = await parseFile(createTempFile("report.xlsx", buildXlsxBuffer()));

    expect(result.text).toContain("Sheet: Report");
    expect(result.text).toContain("Name,Score");
    expect(result.text).toContain("Alice,90");
  });

  it("rejects legacy xls files instead of parsing them with an unmaintained dependency", async () => {
    await expect(parseFile(createTempFile("legacy.xls", "binary-xls"))).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE"
    });
  });

  it("raises a typed unsupported-file error for legacy documents we cannot parse yet", async () => {
    await expect(parseFile(createTempFile("legacy.doc", "binary-doc"))).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE_TYPE"
    });
  });
});
