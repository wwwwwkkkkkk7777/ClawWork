import { apiRequest } from "./api/client";

export type TaskMutationPayload = {
  input: { text: string; fileIds: string[] };
  preferredTone: string;
  preferredLength: string;
};

export type TaskMutationResult = {
  taskId: string;
  sessionId: string;
  streamUrl: string;
  initialStatus: string;
};

export async function createTask(payload: TaskMutationPayload) {
  return apiRequest<TaskMutationResult>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function followUpTask(taskId: string, payload: TaskMutationPayload) {
  return apiRequest<TaskMutationResult>(`/tasks/${taskId}/followup`, {
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
