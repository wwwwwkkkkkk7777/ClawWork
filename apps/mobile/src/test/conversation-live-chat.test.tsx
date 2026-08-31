import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react-native";
import { TextInput } from "react-native";
import { ConversationScreen } from "../screens/ConversationScreen";
import * as filesService from "../services/files";
import * as streamService from "../services/stream";
import * as tasksService from "../services/tasks";
import { taskStore } from "../store/taskStore";

jest.mock("../services/tasks", () => ({
  ...jest.requireActual("../services/tasks"),
  followUpTask: jest.fn(),
  getTaskVersions: jest.fn().mockResolvedValue([])
}));

jest.mock("../services/files", () => ({
  ...jest.requireActual("../services/files"),
  pickAttachments: jest.fn(),
  uploadAttachment: jest.fn()
}));

jest.mock("../services/stream", () => ({
  ...jest.requireActual("../services/stream"),
  subscribeTaskStream: jest.fn()
}));

describe("ConversationScreen live chat", () => {
  it("subscribes to the new follow-up task instead of replaying the previous task stream", async () => {
    taskStore.reset();
    jest.clearAllMocks();

    const subscribeTaskStream = (streamService as unknown as {
      subscribeTaskStream: jest.Mock;
    }).subscribeTaskStream;
    const followUpTask = (tasksService as unknown as {
      followUpTask: jest.Mock;
    }).followUpTask;
    const pickAttachments = (filesService as unknown as {
      pickAttachments: jest.Mock;
    }).pickAttachments;
    const uploadAttachment = (filesService as unknown as {
      uploadAttachment: jest.Mock;
    }).uploadAttachment;

    subscribeTaskStream.mockImplementation(
      (taskId: string, handlers: { onEvent: (event: unknown) => void }) => {
        Promise.resolve().then(() => {
          const runId = taskId === "task-1" ? "run-1" : "run-2";
          const delta = taskId === "task-1" ? "first response" : "follow-up response";

          handlers.onEvent({
            type: "task.accepted",
            taskId,
            sessionId: "session-1",
            runId,
            timestamp: new Date().toISOString()
          });
          handlers.onEvent({
            type: "task.delta",
            taskId,
            sessionId: "session-1",
            runId,
            timestamp: new Date().toISOString(),
            delta
          });

          if (taskId === "task-1") {
            handlers.onEvent({
              type: "task.result.created",
              taskId,
              sessionId: "session-1",
              runId,
              timestamp: new Date().toISOString(),
              result: {
                type: "artifact",
                artifact: {
                  kind: "excel",
                  fileName: "weekly-report.xlsx",
                  mimeType:
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  downloadUrl: "https://example.com/weekly-report.xlsx",
                  previewText: "downloadable spreadsheet"
                }
              }
            });
          }

          handlers.onEvent({
            type: "task.completed",
            taskId,
            sessionId: "session-1",
            runId,
            timestamp: new Date().toISOString()
          });
        });

        return { close: jest.fn() };
      }
    );

    pickAttachments.mockResolvedValue([
      {
        uri: "file:///cache/table.xlsx",
        filename: "table.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 2048
      }
    ]);
    uploadAttachment.mockResolvedValue({
      fileId: "file-2",
      filename: "table.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 2048,
      uploadedAt: "2026-03-16T12:00:00.000Z",
      status: "uploaded",
      storageKey: "clawwork/file-2/table.xlsx"
    });
    followUpTask.mockResolvedValue({
      taskId: "task-2",
      sessionId: "session-1",
      streamUrl: "/tasks/task-2/stream",
      initialStatus: "running"
    });

    act(() => {
      taskStore.startConversation("hello");
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

    expect(await screen.findByText("first response")).toBeTruthy();
    expect(await screen.findByText("weekly-report.xlsx")).toBeTruthy();
    expect(screen.getByText("downloadable spreadsheet")).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText("attach file"));
    });

    expect(await screen.findByText("table.xlsx")).toBeTruthy();

    const composerDock = screen.getByTestId("conversation-composer-dock");
    fireEvent.changeText(
      within(composerDock).UNSAFE_getByType(TextInput),
      "polish it"
    );
    fireEvent.press(within(composerDock).getByLabelText("send message"));

    await waitFor(() => {
      expect(followUpTask).toHaveBeenCalledWith("task-1", {
        input: { text: "polish it", fileIds: ["file-2"] }
      });
    });

    await waitFor(() => {
      expect(subscribeTaskStream).toHaveBeenCalledWith(
        "task-2",
        expect.objectContaining({
          onEvent: expect.any(Function)
        })
      );
    });

    expect(
      subscribeTaskStream.mock.calls.filter(([taskId]) => taskId === "task-1")
    ).toHaveLength(1);
    expect(screen.queryAllByText("first response")).toHaveLength(1);
    expect(await screen.findByText("follow-up response")).toBeTruthy();
  });
});
