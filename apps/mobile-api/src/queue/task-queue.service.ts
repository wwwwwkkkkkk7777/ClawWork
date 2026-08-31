import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { Injectable } from "@nestjs/common";

type TaskJob = { taskId: string };

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

@Injectable()
export class TaskQueueService {
  private readonly name = `${process.env.TASK_QUEUE_NAME?.trim() || "clawwork-task-execution"}${
    process.env.NODE_ENV === "test" ? `-${process.pid}` : ""
  }`;
  private readonly producerConnection = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    enableReadyCheck: true
  });
  private readonly queue = new Queue<TaskJob>(this.name, {
    connection: this.producerConnection
  });
  private worker?: Worker<TaskJob>;
  private workerConnection?: IORedis;

  async enqueue(taskId: string, reconcile = false) {
    if (reconcile) {
      const existing = await this.queue.getJob(taskId);
      const state = await existing?.getState();
      if (existing && (state === "failed" || state === "completed")) {
        await existing.remove();
      }
    }
    const job = await this.queue.add(
      "execute",
      { taskId },
      {
        jobId: taskId,
        attempts: positiveInteger(
          process.env.TASK_QUEUE_ATTEMPTS,
          process.env.NODE_ENV === "test" ? 1 : 5
        ),
        backoff: { type: "exponential", delay: 1_000 },
        removeOnComplete: { age: 3_600, count: 10_000 },
        removeOnFail: { age: 7 * 24 * 3_600, count: 10_000 }
      }
    );
    return job.id ?? taskId;
  }

  async cancel(taskId: string) {
    const job = await this.queue.getJob(taskId);
    if (!job) return false;
    const state = await job.getState();
    if (["waiting", "delayed", "paused", "prioritized"].includes(state)) {
      await job.remove();
      return true;
    }
    return false;
  }

  start(
    processor: (taskId: string) => Promise<void>,
    onFinalFailure: (taskId: string, error: Error) => Promise<void>
  ) {
    if (this.worker || process.env.TASK_WORKER_ENABLED?.toLowerCase() === "false") {
      return;
    }
    this.workerConnection = new IORedis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true
    });
    this.worker = new Worker<TaskJob>(
      this.name,
      async (job) => processor(job.data.taskId),
      {
        connection: this.workerConnection,
        concurrency: positiveInteger(process.env.TASK_QUEUE_CONCURRENCY, 4)
      }
    );
    this.worker.on("failed", (job: Job<TaskJob> | undefined, error: Error) => {
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      void onFinalFailure(job.data.taskId, error).catch((failureError: Error) => {
        console.error(
          JSON.stringify({
            level: "error",
            event: "task_queue_finalization_failed",
            taskId: job.data.taskId,
            message: failureError.message
          })
        );
      });
    });
    this.worker.on("error", (error) => {
      console.error(JSON.stringify({ level: "error", event: "task_queue_error", message: error.message }));
    });
  }

  async ready() {
    return this.producerConnection.ping();
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
    await this.workerConnection?.quit();
    await this.producerConnection.quit();
  }
}
