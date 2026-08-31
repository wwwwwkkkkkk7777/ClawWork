import type { INestApplication } from "@nestjs/common";
import request from "supertest";

let loginSequence = 0;

export async function login(app: INestApplication, prefix = "test") {
  loginSequence += 1;
  const response = await request(app.getHttpServer())
    .post("/auth/dev-login")
    .send({
      nickname: "Integration User",
      email: `${prefix}-${process.pid}-${loginSequence}@example.com`
    })
    .expect(200);

  return response.body.accessToken as string;
}

export function bearer(token: string) {
  return `Bearer ${token}`;
}

export async function uploadObject(uploadUrl: string, content: Buffer, mimeType: string) {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(content.length) },
    body: new Uint8Array(content)
  });
  if (!response.ok) throw new Error(`test object upload failed: ${response.status}`);
}
