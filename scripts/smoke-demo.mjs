import { randomUUID } from "node:crypto";

const apiBaseUrl = (process.env.DEMO_API_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/$/, "");

async function request(path, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    },
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function waitUntilReady() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const health = await request("/health/ready");
      if (health?.status === "ready" || health?.status === "ok") return;
    } catch {
      // Compose services can still be converging.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`demo API did not become ready at ${apiBaseUrl}`);
}

await waitUntilReady();
const suffix = randomUUID().slice(0, 12);
const registration = await request("/auth/register", {
  method: "POST",
  body: JSON.stringify({
    email: `demo-${suffix}@example.invalid`,
    password: `local-demo-password-${suffix}`,
    nickname: "Demo Smoke"
  })
});
if (typeof registration?.accessToken !== "string") {
  throw new Error("registration response did not include an access token");
}
const authorization = { Authorization: `Bearer ${registration.accessToken}` };
const created = await request("/tasks", {
  method: "POST",
  headers: authorization,
  body: JSON.stringify({
    input: { text: "Complete the local demo smoke test [artifact]", fileIds: [] },
    preferredTone: "default",
    preferredLength: "short"
  })
});
if (typeof created?.taskId !== "string") throw new Error("task was not created");

const deadline = Date.now() + 60_000;
let task;
while (Date.now() < deadline) {
  task = await request(`/tasks/${created.taskId}`, { headers: authorization });
  if (["completed", "failed", "cancelled"].includes(task?.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 250));
}
if (task?.status !== "completed") {
  throw new Error(
    `demo task ended as ${task?.status ?? "unknown"}: ${task?.errorMessage ?? "no error message"}`
  );
}
if (!Array.isArray(task.results) || task.results.length === 0) {
  throw new Error("demo task completed without a persisted result");
}
const artifacts = task.results.flatMap((result) =>
  result?.outputJson?.type === "artifact" && result.outputJson.artifact
    ? [result.outputJson.artifact]
    : []
);
if (artifacts.length === 0) {
  throw new Error("demo task did not archive the requested Mock Gateway artifact");
}

await request(`/history/tasks/${created.taskId}`, {
  method: "DELETE",
  headers: authorization
});
console.log(
  JSON.stringify({
    status: "ok",
    taskId: created.taskId,
    resultVersions: task.results.length,
    archivedArtifacts: artifacts.length
  })
);
