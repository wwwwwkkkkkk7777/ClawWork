import { apiRequest } from "./api/client";

export type TaskMutationPayload = {
  input: { text: string; fileIds: string[] };
  preferredTone?: string;
  preferredLength?: string;
};

export type TaskMutationResult = {
  taskId: string;
  sessionId: string;
  streamUrl: string;
  initialStatus: string;
  errorMessage?: string;
};

export type TaskResultVersion = {
  id: string;
  taskId: string;
  sessionId: string;
  versionNo: number;
  outputText: string;
  outputJson: unknown;
  createdAt: string;
};

export type HistoryItem = {
  taskId: string;
  sessionId: string;
  title: string;
  prompt: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoryPage = {
  items: HistoryItem[];
  nextCursor: string | null;
};

export type ActiveTask = {
  id: string;
  sessionId: string;
  inputText: string;
  status: "queued" | "running";
  createdAt: string;
  updatedAt: string;
};

export type HistoryTaskDetail = {
  sessionId: string;
  title: string;
  status: string;
  currentTaskId: string | null;
  tasks: Array<{
    taskId: string;
    parentTaskId: string | null;
    inputText: string;
    status: string;
    errorMessage: string | null;
    createdAt: string;
    result: TaskResultVersion | null;
  }>;
  versions: TaskResultVersion[];
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

export async function regenerateTask(taskId: string) {
  return apiRequest<TaskMutationResult>(`/tasks/${taskId}/regenerate`, {
    method: "POST"
  });
}

export async function listHistory(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiRequest<HistoryPage>(`/history/tasks${query}`);
}

export async function getHistoryTask(taskId: string) {
  return apiRequest<HistoryTaskDetail>(`/history/tasks/${taskId}`);
}

export async function getTaskVersions(taskId: string) {
  return apiRequest<TaskResultVersion[]>(`/tasks/${taskId}/versions`);
}

export async function cancelTask(taskId: string) {
  return apiRequest<{ taskId: string; status: string }>(`/tasks/${taskId}/cancel`, {
    method: "POST"
  });
}

export async function deleteHistoryTask(taskId: string) {
  return apiRequest<{ deleted: boolean; sessionId: string }>(
    `/history/tasks/${taskId}`,
    { method: "DELETE" }
  );
}

export async function listActiveTasks() {
  return apiRequest<ActiveTask[]>("/tasks/active/current");
}
