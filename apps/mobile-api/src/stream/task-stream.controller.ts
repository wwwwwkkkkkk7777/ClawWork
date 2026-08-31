import { Controller, Headers, Inject, MessageEvent, Param, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { TasksService } from "../tasks/tasks.service";
import type { PersistedTaskEvent } from "./task-event-hub";

function isTerminal(event: PersistedTaskEvent) {
  return event.event.type === "task.completed" || event.event.type === "task.failed" || event.event.type === "task.cancelled";
}

function parseLastEventId(input: string | undefined) {
  const parsed = Number(input);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

@Controller("tasks")
export class TaskStreamController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Sse(":id/stream")
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") taskId: string,
    @Headers("last-event-id") lastEventId?: string
  ): Observable<MessageEvent> {
    const afterId = parseLastEventId(lastEventId);

    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      let replaying = true;
      let lastSentId = afterId;
      const liveQueue: PersistedTaskEvent[] = [];

      const emit = (persisted: PersistedTaskEvent) => {
        if (closed || persisted.id <= lastSentId) {
          return;
        }
        lastSentId = persisted.id;
        subscriber.next({
          id: String(persisted.id),
          retry: 1_500,
          data: persisted.event
        });
        if (isTerminal(persisted)) {
          closed = true;
          subscriber.complete();
        }
      };

      const unsubscribe = this.tasksService.subscribeTaskEvents(taskId, (event) => {
        if (replaying) {
          liveQueue.push(event);
          return;
        }
        emit(event);
      });

      void this.tasksService
        .listTaskEvents(user.id, taskId, afterId)
        .then((replay) => {
          const ordered = [...replay, ...liveQueue].sort((left, right) => left.id - right.id);
          for (const event of ordered) {
            emit(event);
            if (closed) {
              break;
            }
          }
          replaying = false;
          if (closed) {
            unsubscribe();
          }
        })
        .catch((error) => {
          if (!closed) {
            closed = true;
            subscriber.error(error);
          }
          unsubscribe();
        });

      return () => {
        closed = true;
        unsubscribe();
      };
    });
  }
}
