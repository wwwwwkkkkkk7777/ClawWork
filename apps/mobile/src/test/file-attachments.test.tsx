import * as DocumentPicker from "expo-document-picker";
import { API_BASE_URL } from "../services/api/client";
import {
  pickAttachments,
  rewriteLoopbackUploadUrl,
  uploadAttachment
} from "../services/files";

jest.mock("expo-document-picker", () => ({
  getDocumentAsync: jest.fn()
}));

describe("file attachment services", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes picked attachment metadata from the document picker", async () => {
    const getDocumentAsync = DocumentPicker.getDocumentAsync as jest.Mock;
    getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: "file:///cache/report.md",
          name: "report.md",
          mimeType: null,
          size: 321
        }
      ]
    });

    await expect(pickAttachments()).resolves.toEqual([
      {
        uri: "file:///cache/report.md",
        filename: "report.md",
        mimeType: "text/markdown",
        sizeBytes: 321
      }
    ]);
  });

  it("rewrites localhost upload urls to the api host", () => {
    const apiHost = new URL(API_BASE_URL).hostname;

    expect(rewriteLoopbackUploadUrl("/files/file-1/content")).toBe(
      `${API_BASE_URL}/files/file-1/content`
    );
    expect(
      rewriteLoopbackUploadUrl("http://127.0.0.1:9000/clawwork/file-1/report.xlsx")
    ).toBe(`http://${apiHost}:9000/clawwork/file-1/report.xlsx`);
  });

  it("requests upload metadata, uploads bytes, and completes the file record", async () => {
    const fetchMock = jest.fn();
    const blob = new Blob(["demo"]);
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "file-1",
          uploadUrl: "/files/file-1/content",
          storageKey: "clawwork/file-1/report.xlsx"
        })
      })
      .mockResolvedValueOnce({
        blob: async () => blob
      })
      .mockResolvedValueOnce({
        ok: true
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          fileId: "file-1",
          filename: "report.xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          sizeBytes: 4096,
          uploadedAt: "2026-03-16T12:00:00.000Z",
          status: "uploaded",
          storageKey: "clawwork/file-1/report.xlsx"
        })
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      uploadAttachment({
        uri: "file:///cache/report.xlsx",
        filename: "report.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 4096
      })
    ).resolves.toMatchObject({
      fileId: "file-1",
      filename: "report.xlsx",
      status: "uploaded"
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("/files/upload-url"),
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "file:///cache/report.xlsx");
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `${API_BASE_URL}/files/file-1/content`,
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        body: blob
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("/files/complete"),
      expect.objectContaining({
        method: "POST"
      })
    );
  });
});
