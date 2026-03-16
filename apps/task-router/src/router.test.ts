import { describe, expect, it } from "vitest";
import { routeTask } from "./index";

describe("routeTask", () => {
  it("routes a summary task", () => {
    expect(routeTask({ text: "帮我总结这份文档", fileIds: ["f1"] }).taskType).toBe(
      "document_summary"
    );
  });

  it("routes a polite client email", () => {
    const result = routeTask({
      text: "写一封跟进客户的邮件，礼貌催一下进度",
      fileIds: []
    });

    expect(result.taskType).toBe("email_draft");
    expect(result.toneStyle).toBe("formal");
  });
});
