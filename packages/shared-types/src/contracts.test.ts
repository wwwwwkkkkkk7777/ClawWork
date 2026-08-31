import { describe, expect, it } from "vitest";
import {
  ArtifactResultSchema,
  FileRecordSchema,
  TaskTypeSchema,
  TaskStreamEventSchema
} from "./index";

describe("shared contracts", () => {
  it("accepts supported MVP task types", () => {
    expect(TaskTypeSchema.parse("document_summary")).toBe("document_summary");
  });

  it("rejects unknown task event shapes", () => {
    expect(() =>
      TaskStreamEventSchema.parse({ type: "task.delta", taskId: "t1" })
    ).toThrow();
  });

  it("accepts durable uploaded file records", () => {
    expect(
      FileRecordSchema.parse({
        fileId: "file-1",
        filename: "meeting-notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048,
        uploadedAt: "2026-03-16T12:00:00.000Z",
        status: "uploaded",
        storageKey: "clawwork/file-1/meeting-notes.pdf"
      })
    ).toMatchObject({
      fileId: "file-1",
      status: "uploaded"
    });
  });

  it("accepts structured artifact results", () => {
    expect(
      ArtifactResultSchema.parse({
        type: "artifact",
        artifact: {
          kind: "excel",
          fileName: "weekly-report.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          downloadUrl: "https://example.com/weekly-report.xlsx",
          previewText: "按项目整理的周报表格",
          sizeBytes: 8192
        }
      })
    ).toMatchObject({
      type: "artifact",
      artifact: {
        kind: "excel"
      }
    });
  });

  it("accepts task.result.created events carrying artifact results", () => {
    expect(
      TaskStreamEventSchema.parse({
        type: "task.result.created",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        timestamp: "2026-03-16T12:00:00.000Z",
        result: {
          type: "artifact",
          artifact: {
            kind: "pdf",
            fileName: "summary.pdf",
            mimeType: "application/pdf",
            downloadUrl: "https://example.com/summary.pdf",
            previewText: "整理后的 PDF 摘要"
          }
        }
      })
    ).toMatchObject({
      type: "task.result.created"
    });
  });

  it("accepts archived artifacts without persisting a signed URL", () => {
    expect(
      ArtifactResultSchema.parse({
        type: "artifact",
        artifact: {
          artifactId: "artifact-1",
          kind: "pdf",
          fileName: "summary.pdf",
          mimeType: "application/pdf",
          previewText: "已归档"
        }
      })
    ).toMatchObject({ artifact: { artifactId: "artifact-1" } });
  });

  it("accepts an explicit task cancellation terminal event", () => {
    expect(
      TaskStreamEventSchema.parse({
        type: "task.cancelled",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        timestamp: "2026-08-31T00:00:00.000Z",
        message: "task cancelled by user"
      })
    ).toMatchObject({ type: "task.cancelled" });
  });
});
