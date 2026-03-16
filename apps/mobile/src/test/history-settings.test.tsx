import { render, screen } from "@testing-library/react-native";
import { HistoryScreen } from "../screens/HistoryScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { taskStore } from "../store/taskStore";

describe("HistoryScreen", () => {
  it("renders the lightweight archive title and cards", () => {
    taskStore.reset();
    render(<HistoryScreen />);

    expect(screen.getByText("历史记录")).toBeTruthy();
    expect(screen.getByText("客户会议纪要")).toBeTruthy();
  });
});

describe("SettingsScreen", () => {
  it("renders grouped assistant-style settings", () => {
    taskStore.reset();
    render(<SettingsScreen />);

    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("输出风格")).toBeTruthy();
    expect(screen.getByText("模型网关")).toBeTruthy();
  });
});
