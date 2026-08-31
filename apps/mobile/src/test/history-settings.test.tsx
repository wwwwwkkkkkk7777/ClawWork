import { act, render, screen } from "@testing-library/react-native";
import { HistoryScreen } from "../screens/HistoryScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { taskStore } from "../store/taskStore";

jest.mock("../services/tasks", () => ({
  listHistory: jest.fn().mockResolvedValue([
    {
      taskId: "task-1",
      sessionId: "session-1",
      title: "客户会议纪要",
      prompt: "帮我整理这次客户会议纪要",
      status: "completed",
      errorMessage: null,
      createdAt: "2026-08-30T10:00:00.000Z",
      updatedAt: "2026-08-30T10:01:00.000Z"
    }
  ]),
  getHistoryTask: jest.fn()
}));

jest.mock("../services/settings", () => ({
  getSettings: jest.fn().mockResolvedValue({
    preferredTone: "balanced",
    preferredLength: "standard",
    preferredLanguage: "zh-CN"
  }),
  updateSettings: jest.fn()
}));

describe("HistoryScreen", () => {
  it("renders server-backed history cards", async () => {
    taskStore.reset();
    render(<HistoryScreen />);

    expect(screen.getByText("历史记录")).toBeTruthy();
    expect(await screen.findByText("客户会议纪要")).toBeTruthy();
  });
});

describe("SettingsScreen", () => {
  it("renders persisted assistant settings", async () => {
    taskStore.reset();
    render(<SettingsScreen />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("输出风格")).toBeTruthy();
    expect(screen.getByText("模型网关")).toBeTruthy();
    expect(await screen.findByText("均衡")).toBeTruthy();
  });
});
