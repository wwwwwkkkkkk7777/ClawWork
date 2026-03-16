import { API_BASE_URL } from "./api/client";

export function buildTaskStreamUrl(taskId: string) {
  return `${API_BASE_URL}/tasks/${taskId}/stream`;
}
