import type { TaskStreamEvent } from "@clawwork/shared-types";

export type BrokerEvent = {
  id: number;
  event: TaskStreamEvent;
};

type Listener = (event: BrokerEvent) => void;

function isTerminalEvent(event: TaskStreamEvent) {
  return event.type === "task.completed" || event.type === "task.failed" || event.type === "task.cancelled";
}

export class TaskEventBroker {
  private readonly history = new Map<string, BrokerEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly cleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly nextIds = new Map<string, number>();

  constructor(
    private readonly retentionMs = 5 * 60_000,
    private readonly maxEventsPerTask = 1_000
  ) {}

  publish(taskId: string, event: TaskStreamEvent) {
    const brokerEvent = {
      id: this.nextIds.get(taskId) ?? 1,
      event
    };
    this.nextIds.set(taskId, brokerEvent.id + 1);

    const nextHistory = [...(this.history.get(taskId) ?? []), brokerEvent].slice(
      -this.maxEventsPerTask
    );
    this.history.set(taskId, nextHistory);

    for (const listener of this.listeners.get(taskId) ?? []) {
      listener(brokerEvent);
    }

    if (isTerminalEvent(event)) {
      this.listeners.delete(taskId);
      this.scheduleCleanup(taskId);
    }

    return brokerEvent;
  }

  replay(taskId: string, afterId = 0) {
    return (this.history.get(taskId) ?? []).filter((item) => item.id > afterId);
  }

  subscribe(taskId: string, listener: Listener) {
    const taskListeners = this.listeners.get(taskId) ?? new Set<Listener>();
    taskListeners.add(listener);
    this.listeners.set(taskId, taskListeners);

    return () => {
      const current = this.listeners.get(taskId);
      if (!current) return;

      current.delete(listener);
      if (current.size === 0) this.listeners.delete(taskId);
    };
  }

  cleanup(taskId: string) {
    const timer = this.cleanupTimers.get(taskId);
    if (timer) clearTimeout(timer);
    this.cleanupTimers.delete(taskId);
    this.history.delete(taskId);
    this.listeners.delete(taskId);
    this.nextIds.delete(taskId);
  }

  close() {
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
    this.history.clear();
    this.listeners.clear();
    this.nextIds.clear();
  }

  private scheduleCleanup(taskId: string) {
    const previousTimer = this.cleanupTimers.get(taskId);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => this.cleanup(taskId), this.retentionMs);
    timer.unref?.();
    this.cleanupTimers.set(taskId, timer);
  }
}
