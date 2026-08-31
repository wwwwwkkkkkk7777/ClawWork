import type { ArtifactResult } from "@clawwork/shared-types";
import { authStore } from "../store/authStore";
import { API_BASE_URL } from "./api/client";

type EventBase = {
  taskId: string;
  sessionId: string;
  runId: string;
  timestamp: string;
};

export type TaskStreamEvent =
  | (EventBase & { type: "task.accepted" })
  | (EventBase & { type: "task.stage.changed"; stage: string })
  | (EventBase & { type: "task.delta"; delta: string })
  | (EventBase & {
      type: "task.result.created";
      result: ArtifactResult | Record<string, unknown>;
    })
  | (EventBase & { type: "task.completed" })
  | (EventBase & { type: "task.cancelled"; message: string })
  | (EventBase & { type: "task.failed"; code: string; message: string });

export type TaskStreamHandlers = {
  onEvent: (event: TaskStreamEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
};

export type TaskStreamSubscription = {
  close: () => void;
};

export function buildTaskStreamUrl(taskId: string) {
  return `${API_BASE_URL}/tasks/${taskId}/stream`;
}

function isTerminalEvent(event: TaskStreamEvent) {
  return event.type === "task.completed" || event.type === "task.failed" || event.type === "task.cancelled";
}

export function subscribeTaskStream(
  taskId: string,
  handlers: TaskStreamHandlers
): TaskStreamSubscription {
  let xhr: XMLHttpRequest | null = null;
  let closed = false;
  let terminal = false;
  let lastEventId = "";
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed || terminal) return;
    const current = new XMLHttpRequest();
    xhr = current;
    let cursor = 0;
    let buffer = "";
    let retryScheduled = false;

    const flush = () => {
      if (closed || current !== xhr) return;
      const responseText = current.responseText ?? "";
      const nextChunk = responseText.slice(cursor);
      if (!nextChunk) return;

      cursor = responseText.length;
      buffer += nextChunk.replace(/\r\n/g, "\n");

      while (buffer.includes("\n\n")) {
        const separatorIndex = buffer.indexOf("\n\n");
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const lines = rawEvent.split("\n");
        const eventId = lines.find((line) => line.startsWith("id: "))?.slice(4);
        const dataLine = lines.find((line) => line.startsWith("data: "));

        if (eventId) lastEventId = eventId;
        if (!dataLine) continue;

        const event = JSON.parse(dataLine.slice(6)) as TaskStreamEvent;
        retryCount = 0;
        handlers.onEvent(event);

        if (isTerminalEvent(event)) {
          terminal = true;
          handlers.onComplete?.();
          current.abort();
          return;
        }
      }
    };

    const retry = (error: Error) => {
      if (closed || terminal || current !== xhr) return;
      if (retryScheduled) return;
      retryScheduled = true;
      if (retryCount >= 5) {
        closed = true;
        handlers.onError?.(error);
        return;
      }
      retryCount += 1;
      const delay = Math.min(4_000, 400 * 2 ** (retryCount - 1));
      retryTimer = setTimeout(connect, delay);
    };

    current.open("GET", buildTaskStreamUrl(taskId), true);
    current.setRequestHeader("Accept", "text/event-stream");
    const accessToken = authStore.getState().accessToken;
    if (accessToken) current.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    if (lastEventId) current.setRequestHeader("Last-Event-ID", lastEventId);

    current.onprogress = flush;
    current.onreadystatechange = () => {
      if (closed || terminal || current !== xhr) return;
      if (current.readyState === 3 || current.readyState === 4) flush();
      if (current.readyState === 4 && !terminal) {
        retry(new Error(`stream closed: ${current.status || "network"}`));
      }
    };
    current.onerror = () => retry(new Error("stream failed"));
    current.send();
  };

  connect();

  return {
    close() {
      if (closed) {
        return;
      }

      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      xhr?.abort();
    }
  };
}
