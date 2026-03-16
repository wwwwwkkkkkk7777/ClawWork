import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";

type CreateTaskInput = {
  input: {
    text: string;
    fileIds: string[];
  };
  preferredTone: string;
  preferredLength: string;
};

type TaskRecord = {
  taskId: string;
  sessionId: string;
  input: CreateTaskInput["input"];
  preferredTone: string;
  preferredLength: string;
  status: "queued" | "running" | "completed";
  createdAt: string;
};

type FileRecord = {
  fileId: string;
  filename: string;
  uploadedAt: string;
};

@Injectable()
export class TasksService {
  private readonly tasks = new Map<string, TaskRecord>();
  private readonly files = new Map<string, FileRecord>();

  async createTask(input: CreateTaskInput) {
    const taskId = randomUUID();
    const task: TaskRecord = {
      taskId,
      sessionId: randomUUID(),
      input: input.input,
      preferredTone: input.preferredTone,
      preferredLength: input.preferredLength,
      status: "queued",
      createdAt: new Date().toISOString()
    };

    this.tasks.set(taskId, task);

    return {
      taskId,
      sessionId: task.sessionId,
      streamUrl: `/tasks/${taskId}/stream`,
      initialStatus: task.status
    };
  }

  getTask(taskId: string) {
    return this.tasks.get(taskId) ?? null;
  }

  listHistory() {
    return [...this.tasks.values()].map((task) => ({
      taskId: task.taskId,
      sessionId: task.sessionId,
      title: task.input.text.slice(0, 40),
      status: task.status,
      createdAt: task.createdAt
    }));
  }

  createUploadUrl(filename: string) {
    const fileId = randomUUID();
    return {
      fileId,
      uploadUrl: `http://localhost:9000/clawwork/${fileId}/${filename}`
    };
  }

  completeUpload(fileId: string, filename: string) {
    const file = {
      fileId,
      filename,
      uploadedAt: new Date().toISOString()
    };

    this.files.set(fileId, file);
    return file;
  }
}
