import { prisma } from "@clawwork/database";
import { Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry
} from "prom-client";

@Injectable()
export class ObservabilityService {
  readonly registry = new Registry();
  private readonly requests = new Counter({
    name: "clawwork_http_requests_total",
    help: "Completed HTTP requests",
    labelNames: ["method", "status"] as const,
    registers: [this.registry]
  });
  private readonly duration = new Histogram({
    name: "clawwork_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "status"] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry]
  });
  private readonly tasks = new Gauge({
    name: "clawwork_tasks",
    help: "Persisted tasks by status",
    labelNames: ["status"] as const,
    registers: [this.registry]
  });

  constructor() {
    this.registry.setDefaultLabels({ service: "mobile-api" });
    collectDefaultMetrics({ register: this.registry, prefix: "clawwork_" });
  }

  recordRequest(method: string, status: number, seconds: number) {
    const labels = { method, status: String(status) };
    this.requests.inc(labels);
    this.duration.observe(labels, seconds);
  }

  async renderMetrics() {
    const groups = await prisma.task.groupBy({ by: ["status"], _count: { _all: true } });
    this.tasks.reset();
    for (const group of groups) this.tasks.set({ status: group.status }, group._count._all);
    return this.registry.metrics();
  }
}
