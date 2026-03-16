import { Controller, MessageEvent, Param, Sse } from "@nestjs/common";
import { Observable, of } from "rxjs";

@Controller("tasks")
export class TaskStreamController {
  @Sse(":id/stream")
  stream(@Param("id") id: string): Observable<MessageEvent> {
    return of({
      data: {
        type: "task.accepted",
        taskId: id,
        sessionId: "placeholder-session",
        runId: "placeholder-run",
        timestamp: new Date().toISOString()
      }
    });
  }
}
