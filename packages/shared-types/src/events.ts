import { z } from "zod";
import { ArtifactResultSchema } from "./files";

const EventBase = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  timestamp: z.string()
});

export const TaskStreamEventSchema = z.discriminatedUnion("type", [
  EventBase.extend({ type: z.literal("task.accepted") }),
  EventBase.extend({
    type: z.literal("task.stage.changed"),
    stage: z.string()
  }),
  EventBase.extend({
    type: z.literal("task.delta"),
    delta: z.string()
  }),
  EventBase.extend({
    type: z.literal("task.result.created"),
    result: z.union([ArtifactResultSchema, z.record(z.any())])
  }),
  EventBase.extend({ type: z.literal("task.completed") }),
  EventBase.extend({
    type: z.literal("task.cancelled"),
    message: z.string()
  }),
  EventBase.extend({
    type: z.literal("task.failed"),
    code: z.string(),
    message: z.string()
  })
]);

export type TaskStreamEvent = z.infer<typeof TaskStreamEventSchema>;
