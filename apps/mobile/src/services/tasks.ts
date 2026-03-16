import { apiRequest } from "./api/client";

export type CreateTaskPayload = {
  input: { text: string; fileIds: string[] };
  preferredTone: string;
  preferredLength: string;
};

export async function createTask(payload: CreateTaskPayload) {
  return apiRequest<{
    taskId: string;
    sessionId: string;
    streamUrl: string;
    initialStatus: string;
  }>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listHistory() {
  return apiRequest<
    {
      taskId: string;
      sessionId: string;
      title: string;
      status: string;
      createdAt: string;
    }[]
  >("/history/tasks");
}
