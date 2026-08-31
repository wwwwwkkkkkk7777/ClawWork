import type { TaskStreamEvent } from "@clawwork/shared-types";
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";

export type PersistedTaskEvent = {
  id: number;
  event: TaskStreamEvent;
};

type Listener = (event: PersistedTaskEvent) => void;

@Injectable()
export class TaskEventHub implements OnModuleInit, OnModuleDestroy {
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly origin = randomUUID();
  private readonly channel = "clawwork:task-events";
  private readonly enabled = process.env.REDIS_EVENTS_ENABLED?.toLowerCase() !== "false";
  private readonly publisher = this.enabled ? new IORedis(process.env.REDIS_URL!) : undefined;
  private readonly subscriber = this.enabled ? new IORedis(process.env.REDIS_URL!) : undefined;

  async onModuleInit() {
    if (!this.subscriber) return;
    this.subscriber.on("message", (_channel, raw) => {
      try {
        const message = JSON.parse(raw) as {
          origin: string;
          taskId: string;
          event: PersistedTaskEvent;
        };
        if (message.origin !== this.origin) this.deliver(message.taskId, message.event);
      } catch {
        // Ignore malformed messages from outside this application.
      }
    });
    await this.subscriber.subscribe(this.channel);
  }

  publish(taskId: string, event: PersistedTaskEvent) {
    this.deliver(taskId, event);
    if (this.publisher) {
      void this.publisher
        .publish(this.channel, JSON.stringify({ origin: this.origin, taskId, event }))
        .catch((error: Error) => {
          console.error(
            JSON.stringify({
              level: "error",
              event: "task_event_publish_failed",
              message: error.message
            })
          );
        });
    }
  }

  private deliver(taskId: string, event: PersistedTaskEvent) {
    const listeners = this.listeners.get(taskId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }

    if (event.event.type === "task.completed" || event.event.type === "task.failed") {
      this.listeners.delete(taskId);
    }
  }

  subscribe(taskId: string, listener: Listener) {
    const listeners = this.listeners.get(taskId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);

    return () => {
      const current = this.listeners.get(taskId);
      current?.delete(listener);
      if (current?.size === 0) {
        this.listeners.delete(taskId);
      }
    };
  }

  async onModuleDestroy() {
    if (this.subscriber) {
      await this.subscriber.unsubscribe(this.channel);
      await this.subscriber.quit();
    }
    await this.publisher?.quit();
    this.listeners.clear();
  }
}
