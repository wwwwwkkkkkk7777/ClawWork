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
  | (EventBase & { type: "task.result.created"; result: Record<string, unknown> })
  | (EventBase & { type: "task.completed" })
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
  return event.type === "task.completed" || event.type === "task.failed";
}

export function subscribeTaskStream(
  taskId: string,
  handlers: TaskStreamHandlers
): TaskStreamSubscription {
  const xhr = new XMLHttpRequest();
  let cursor = 0;
  let buffer = "";
  let closed = false;

  const flush = () => {
    if (closed) {
      return;
    }

    const responseText = xhr.responseText ?? "";
    const nextChunk = responseText.slice(cursor);
    if (!nextChunk) {
      return;
    }

    cursor = responseText.length;
    buffer += nextChunk.replace(/\r\n/g, "\n");

    while (buffer.includes("\n\n")) {
      const separatorIndex = buffer.indexOf("\n\n");
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);

      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        continue;
      }

      const event = JSON.parse(dataLine.slice(6)) as TaskStreamEvent;
      handlers.onEvent(event);

      if (isTerminalEvent(event)) {
        closed = true;
        handlers.onComplete?.();
        xhr.abort();
        return;
      }
    }
  };

  xhr.open("GET", buildTaskStreamUrl(taskId), true);
  xhr.setRequestHeader("Accept", "text/event-stream");

  xhr.onprogress = flush;
  xhr.onreadystatechange = () => {
    if (closed) {
      return;
    }

    if (xhr.readyState === 3 || xhr.readyState === 4) {
      flush();
    }

    if (xhr.readyState === 4) {
      if (xhr.status >= 400) {
        closed = true;
        handlers.onError?.(new Error(`stream failed: ${xhr.status}`));
        return;
      }

      closed = true;
      handlers.onComplete?.();
    }
  };

  xhr.onerror = () => {
    if (closed) {
      return;
    }

    closed = true;
    handlers.onError?.(new Error("stream failed"));
  };

  xhr.send();

  return {
    close() {
      if (closed) {
        return;
      }

      closed = true;
      xhr.abort();
    }
  };
}
