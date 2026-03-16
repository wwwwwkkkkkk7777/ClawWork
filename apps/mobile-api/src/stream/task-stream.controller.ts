import { Inject } from "@nestjs/common";
import { Controller, MessageEvent, Param, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import type { TaskStreamEvent } from "@clawwork/shared-types";
import { TasksService } from "../tasks/tasks.service";

@Controller("tasks")
export class TaskStreamController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Sse(":id/stream")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    const source = this.tasksService.getTaskStreamSource(id);
    if (!source) {
      return new Observable<MessageEvent>((subscriber) => {
        subscriber.next({
          data: {
            type: "task.accepted",
            taskId: id,
            sessionId: "placeholder-session",
            runId: "placeholder-run",
            timestamp: new Date().toISOString()
          }
        });
        subscriber.complete();
      });
    }

    return new Observable<MessageEvent>((subscriber) => {
      const controller = new AbortController();

      void (async () => {
        try {
          const response = await fetch(source.url, {
            headers: {
              Accept: "text/event-stream"
            },
            signal: controller.signal
          });

          if (!response.ok || !response.body) {
            throw new Error("adapter stream unavailable");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });

            while (buffer.includes("\n\n")) {
              const separatorIndex = buffer.indexOf("\n\n");
              const rawEvent = buffer.slice(0, separatorIndex);
              buffer = buffer.slice(separatorIndex + 2);

              const event = parseTaskEvent(rawEvent);
              if (!event) {
                continue;
              }

              this.tasksService.applyStreamEvent(event);
              subscriber.next({ data: event });

              if (
                event.type === "task.completed" ||
                event.type === "task.failed"
              ) {
                subscriber.complete();
                return;
              }
            }
          }

          subscriber.complete();
        } catch (error) {
          if (controller.signal.aborted) {
            return;
          }

          subscriber.error(error);
        }
      })();

      return () => {
        controller.abort();
      };
    });
  }
}

function parseTaskEvent(rawEvent: string) {
  const dataLine = rawEvent
    .split("\n")
    .find((line) => line.startsWith("data: "));
  if (!dataLine) {
    return null;
  }

  return JSON.parse(dataLine.slice(6)) as TaskStreamEvent;
}
