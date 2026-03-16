import { describe, expect, it } from "vitest";
import { TaskTypeSchema, TaskStreamEventSchema } from "./index";

describe("shared contracts", () => {
  it("accepts supported MVP task types", () => {
    expect(TaskTypeSchema.parse("document_summary")).toBe("document_summary");
  });

  it("rejects unknown task event shapes", () => {
    expect(() =>
      TaskStreamEventSchema.parse({ type: "task.delta", taskId: "t1" })
    ).toThrow();
  });
});
