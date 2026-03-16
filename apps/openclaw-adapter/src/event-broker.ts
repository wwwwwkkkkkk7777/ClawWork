import type { TaskStreamEvent } from "@clawwork/shared-types";

type Listener = (event: TaskStreamEvent) => void;

function isTerminalEvent(event: TaskStreamEvent) {
  return event.type === "task.completed" || event.type === "task.failed";
}

export class TaskEventBroker {
  private readonly history = new Map<string, TaskStreamEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();

  publish(taskId: string, event: TaskStreamEvent) {
    const nextHistory = this.history.get(taskId) ?? [];
    nextHistory.push(event);
    this.history.set(taskId, nextHistory);

    const taskListeners = this.listeners.get(taskId);
    if (!taskListeners) {
      return;
    }

    for (const listener of taskListeners) {
      listener(event);
    }

    if (isTerminalEvent(event)) {
      this.listeners.delete(taskId);
    }
  }

  replay(taskId: string) {
    return [...(this.history.get(taskId) ?? [])];
  }

  subscribe(taskId: string, listener: Listener) {
    const taskListeners = this.listeners.get(taskId) ?? new Set<Listener>();
    taskListeners.add(listener);
    this.listeners.set(taskId, taskListeners);

    return () => {
      const current = this.listeners.get(taskId);
      if (!current) {
        return;
      }

      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }
}
