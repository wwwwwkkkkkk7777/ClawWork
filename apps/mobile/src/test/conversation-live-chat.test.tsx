import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import { ConversationScreen } from "../screens/ConversationScreen";
import { taskStore } from "../store/taskStore";
import * as tasksService from "../services/tasks";
import * as streamService from "../services/stream";

jest.mock("../services/tasks", () => ({
  ...jest.requireActual("../services/tasks"),
  followUpTask: jest.fn()
}));

jest.mock("../services/stream", () => ({
  ...jest.requireActual("../services/stream"),
  subscribeTaskStream: jest.fn()
}));

describe("ConversationScreen live chat", () => {
  it("subscribes to task streams and sends follow-ups through the api", async () => {
    taskStore.reset();
    jest.clearAllMocks();

    const subscribeTaskStream = (streamService as unknown as {
      subscribeTaskStream: jest.Mock;
    }).subscribeTaskStream;
    const followUpTask = (tasksService as unknown as {
      followUpTask: jest.Mock;
    }).followUpTask;

    subscribeTaskStream.mockImplementation(
      (_taskId: string, handlers: { onEvent: (event: unknown) => void }) => {
        Promise.resolve().then(() => {
          handlers.onEvent({
            type: "task.accepted",
            taskId: "task-1",
            sessionId: "session-1",
            runId: "run-1",
            timestamp: new Date().toISOString()
          });
          handlers.onEvent({
            type: "task.delta",
            taskId: "task-1",
            sessionId: "session-1",
            runId: "run-1",
            timestamp: new Date().toISOString(),
            delta: "真实流式回复"
          });
          handlers.onEvent({
            type: "task.completed",
            taskId: "task-1",
            sessionId: "session-1",
            runId: "run-1",
            timestamp: new Date().toISOString()
          });
        });

        return { close: jest.fn() };
      }
    );

    followUpTask.mockResolvedValue({
      taskId: "task-2",
      sessionId: "session-1",
      streamUrl: "/tasks/task-2/stream",
      initialStatus: "running"
    });

    act(() => {
      taskStore.startConversation("你好");
      taskStore.setExecutionMeta({
        taskId: "task-1",
        sessionId: "session-1",
        initialStatus: "running"
      });
    });

    render(<ConversationScreen />);

    await waitFor(() => {
      expect(subscribeTaskStream).toHaveBeenCalledWith(
        "task-1",
        expect.objectContaining({
          onEvent: expect.any(Function)
        })
      );
    });

    expect(await screen.findByText("真实流式回复")).toBeTruthy();

    const composerDock = screen.getByTestId("conversation-composer-dock");
    fireEvent.changeText(
      within(composerDock).getByPlaceholderText("发送消息或按住说话…"),
      "继续润色"
    );
    fireEvent.press(within(composerDock).getByLabelText("send message"));

    await waitFor(() => {
      expect(followUpTask).toHaveBeenCalledWith("task-1", {
        input: { text: "继续润色", fileIds: [] },
        preferredTone: "default",
        preferredLength: "medium"
      });
    });
  });
});
