import { describe, expect, it, vi } from "vitest";
import { TaskEventBroker } from "../src/event-broker";

function event(type: "task.accepted" | "task.completed") {
  return {
    type,
    taskId: "task-1",
    sessionId: "session-1",
    runId: "run-1",
    timestamp: new Date().toISOString()
  } as const;
}

describe("TaskEventBroker", () => {
  it("replays after the SSE cursor and cleans terminal history after retention", () => {
    vi.useFakeTimers();
    const broker = new TaskEventBroker(1_000, 10);
    broker.publish("task-1", event("task.accepted"));
    broker.publish("task-1", event("task.completed"));

    expect(broker.replay("task-1", 1).map((item) => item.id)).toEqual([2]);
    vi.advanceTimersByTime(1_000);
    expect(broker.replay("task-1")).toEqual([]);

    broker.close();
    vi.useRealTimers();
  });
});
