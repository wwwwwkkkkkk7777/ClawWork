import { fireEvent, render, screen } from "@testing-library/react-native";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";
import { authStore } from "../store/authStore";

jest.mock("../services/tasks", () => ({
  createTask: jest.fn().mockResolvedValue({
    taskId: "task-1",
    sessionId: "session-1",
    streamUrl: "/tasks/task-1/stream",
    initialStatus: "failed",
    errorMessage: "gateway unavailable"
  })
}));

describe("mobile task flow", () => {
  it("starts from home and enters conversation after send", async () => {
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

    fireEvent.changeText(
      screen.getByPlaceholderText("发送消息或按住说话…"),
      "帮我整理会议纪要"
    );
    fireEvent.press(screen.getByLabelText("send message"));

    expect(screen.getAllByText("帮我整理会议纪要")).toHaveLength(2);
    expect(await screen.findByText("gateway unavailable")).toBeTruthy();
  });
});
