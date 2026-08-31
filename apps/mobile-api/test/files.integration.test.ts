import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/main";
import { bearer, login, uploadObject } from "./test-auth";

describe("files api", () => {
  it("creates upload metadata for richer file payloads", async () => {
    const app = await createApp();
    const token = await login(app, "files-metadata");
    const response = await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(token))
      .send({
        filename: "meeting-notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 2048
      })
      .expect(201);

    expect(response.body.fileId).toBeTruthy();
    expect(response.body.uploadUrl).toMatch(/^https?:\/\//);
    expect(response.body.uploadUrl).toContain("X-Amz-Signature=");
    expect(response.body.storageKey).toMatch(/meeting-notes\.pdf$/);
    await app.close();
  });

  it("stores uploaded bytes through the mobile-api upload endpoint", async () => {
    const app = await createApp();
    const token = await login(app, "files-content");
    const content = Buffer.from("spreadsheet-content");
    const upload = await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(token))
      .send({
        filename: "report.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: content.length
        })
      .expect(201);

    await uploadObject(
      upload.body.uploadUrl,
      content,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    const response = await request(app.getHttpServer())
      .post("/files/complete")
      .set("Authorization", bearer(token))
      .send({
        fileId: upload.body.fileId,
        filename: "report.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: content.length,
        storageKey: upload.body.storageKey
      })
      .expect(201);

    expect(response.body).toMatchObject({
      fileId: upload.body.fileId,
      filename: "report.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: content.length,
      status: "uploaded",
      storageKey: upload.body.storageKey
    });
    expect(response.body.uploadedAt).toBeTruthy();
    await request(app.getHttpServer())
      .delete(`/files/${upload.body.fileId}`)
      .set("Authorization", bearer(token))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/files/${upload.body.fileId}`)
      .set("Authorization", bearer(token))
      .expect(404);
    await app.close();
  });

  it("enforces validation, upload limits, and file ownership", async () => {
    const app = await createApp();
    const ownerToken = await login(app, "file-owner");
    const otherToken = await login(app, "file-other");

    await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(ownerToken))
      .send({
        filename: "too-large.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10 * 1024 * 1024 + 1
      })
      .expect(413);

    await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(ownerToken))
      .send({
        filename: "unknown.pdf",
        mimeType: "application/pdf",
        sizeBytes: 8,
        unexpected: true
      })
      .expect(400);

    const upload = await request(app.getHttpServer())
      .post("/files/upload-url")
      .set("Authorization", bearer(ownerToken))
      .send({ filename: "owned.pdf", mimeType: "application/pdf", sizeBytes: 8 })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/files/${upload.body.fileId}`)
      .set("Authorization", bearer(otherToken))
      .expect(404);
    await request(app.getHttpServer())
      .post("/files/complete")
      .set("Authorization", bearer(otherToken))
      .send({
        fileId: upload.body.fileId,
        filename: "owned.pdf",
        mimeType: "application/pdf",
        sizeBytes: 8,
        storageKey: upload.body.storageKey
      })
      .expect(404);

    await app.close();
  });
});
