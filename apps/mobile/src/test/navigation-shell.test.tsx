import { act, render, screen } from "@testing-library/react-native";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";
import { authStore } from "../store/authStore";

jest.mock("../services/tasks", () => ({
  listHistory: jest.fn().mockResolvedValue([]),
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

describe("RootNavigator", () => {
  it("shows the login screen when signed out", () => {
    authStore.clear();
    render(<RootNavigator />);
    expect(screen.getByText("登录后继续工作")).toBeTruthy();
  });

  it("renders home by default and can switch to history and settings", async () => {
    routeStore.reset();
    taskStore.reset();
    authStore.setSession({
      accessToken: "test-access",
      refreshToken: "test-refresh",
      userId: "user-1",
      email: "test@example.com",
      nickname: "Test User"
    });
    render(<RootNavigator />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();

    act(() => routeStore.navigate("history"));
    expect(screen.getByText("历史记录")).toBeTruthy();

    act(() => routeStore.navigate("settings"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("设置")).toBeTruthy();
    expect(await screen.findByText("均衡")).toBeTruthy();
  });
});
