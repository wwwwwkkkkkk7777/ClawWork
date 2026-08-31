import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { HomeScreen } from "../screens/HomeScreen";
import { taskStore } from "../store/taskStore";
import * as filesService from "../services/files";
import * as tasksService from "../services/tasks";

jest.mock("../services/files", () => ({
  ...jest.requireActual("../services/files"),
  pickAttachments: jest.fn(),
  uploadAttachment: jest.fn()
}));

jest.mock("../services/tasks", () => ({
  ...jest.requireActual("../services/tasks"),
  createTask: jest.fn()
}));

describe("HomeScreen", () => {
  it("renders the streamlined entry content without recent conversations", () => {
    taskStore.reset();
    render(<HomeScreen />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();
    expect(screen.getByText("总结文档")).toBeTruthy();
    expect(screen.getByText("会议纪要")).toBeTruthy();
    expect(screen.queryByText("最近对话")).toBeNull();
    expect(screen.getByPlaceholderText("发送消息或按住说话…")).toBeTruthy();
  });

  it("uploads attachments and sends their file ids with the first task", async () => {
    taskStore.reset();
    jest.clearAllMocks();

    const pickAttachments = (filesService as unknown as {
      pickAttachments: jest.Mock;
    }).pickAttachments;
    const uploadAttachment = (filesService as unknown as {
      uploadAttachment: jest.Mock;
    }).uploadAttachment;
    const createTask = (tasksService as unknown as {
      createTask: jest.Mock;
    }).createTask;

    pickAttachments.mockResolvedValue([
      {
        uri: "file:///cache/summary.pdf",
        filename: "summary.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      }
    ]);
    uploadAttachment.mockResolvedValue({
      fileId: "file-1",
      filename: "summary.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: "2026-03-16T12:00:00.000Z",
      status: "uploaded",
      storageKey: "clawwork/file-1/summary.pdf"
    });
    createTask.mockResolvedValue({
      taskId: "task-1",
      sessionId: "session-1",
      streamUrl: "/tasks/task-1/stream",
      initialStatus: "running"
    });

    render(<HomeScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText("attach file"));
    });

    expect(await screen.findByText("summary.pdf")).toBeTruthy();

    fireEvent.changeText(
      screen.getByPlaceholderText("发送消息或按住说话…"),
      "帮我总结这份文档"
    );
    fireEvent.press(screen.getByLabelText("send message"));

    await waitFor(() => {
      expect(createTask).toHaveBeenCalledWith({
        input: { text: "帮我总结这份文档", fileIds: ["file-1"] }
      });
    });
  });
});
