import type { ArtifactResult, FileRecord } from "@clawwork/shared-types";
import type { TaskStreamEvent } from "../services/stream";
import type {
  HistoryTaskDetail,
  TaskResultVersion
} from "../services/tasks";

type Listener = () => void;

export type UserConversationMessage = {
  id: string;
  kind: "user";
  role: "user";
  text: string;
  runId?: string;
};

export type AssistantConversationMessage = {
  id: string;
  kind: "assistant";
  role: "assistant";
  text: string;
  runId?: string;
};

export type ArtifactConversationMessage = {
  id: string;
  kind: "artifact";
  artifact: ArtifactResult["artifact"] & { downloadUrl: string };
  runId?: string;
};

export type ConversationMessage =
  | UserConversationMessage
  | AssistantConversationMessage
  | ArtifactConversationMessage;

export type RecentConversation = {
  id: string;
  sessionId?: string;
  title: string;
  subtitle: string;
  status: string;
  prompt: string;
};

export type PendingAttachment = {
  clientId: string;
  fileId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "uploading" | "uploaded" | "failed";
  storageKey?: string;
  errorMessage?: string;
};

type TaskState = {
  draft: string;
  lastSubmittedTaskText: string | null;
  submitCount: number;
  currentTaskId: string | null;
  currentSessionId: string | null;
  currentStatus: string | null;
  currentError: string | null;
  currentTitle: string;
  currentRunId: string | null;
  messages: ConversationMessage[];
  pendingAttachments: PendingAttachment[];
  recentConversations: RecentConversation[];
  resultVersions: TaskResultVersion[];
  selectedVersionNo: number | null;
};

const listeners = new Set<Listener>();

const initialState: TaskState = {
  draft: "",
  lastSubmittedTaskText: null,
  submitCount: 0,
  currentTaskId: null,
  currentSessionId: null,
  currentStatus: null,
  currentError: null,
  currentTitle: "新对话",
  currentRunId: null,
  messages: [
    {
      id: "welcome-assistant",
      kind: "assistant",
      role: "assistant",
      text: "你好呀！很高兴认识你😊"
    }
  ],
  pendingAttachments: [],
  recentConversations: [],
  resultVersions: [],
  selectedVersionNo: null
};

const state: TaskState = {
  ...initialState,
  messages: [...initialState.messages],
  pendingAttachments: [...initialState.pendingAttachments],
  recentConversations: [...initialState.recentConversations],
  resultVersions: [...initialState.resultVersions]
};

let snapshot = createSnapshot();

function createSnapshot() {
  return {
    ...state,
    messages: [...state.messages],
    pendingAttachments: [...state.pendingAttachments],
    recentConversations: [...state.recentConversations],
    resultVersions: [...state.resultVersions]
  };
}

function emit() {
  snapshot = createSnapshot();
  listeners.forEach((listener) => listener());
}

function nextId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function buildTitle(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "新对话";
  }

  return trimmed.length > 10 ? `${trimmed.slice(0, 10)}…` : trimmed;
}

function buildAssistantPreview(text: string) {
  if (text.includes("你好")) {
    return "你好呀！很高兴认识你😊";
  }

  if (text.includes("会议") || text.includes("纪要")) {
    return "收到，我先帮你整理会议纪要结构，再继续细化重点和待办。";
  }

  if (text.includes("邮件")) {
    return "可以，我会先给你起一版清晰礼貌的邮件草稿，再一起调整语气。";
  }

  if (text.includes("总结") || text.includes("文档")) {
    return "好的，我先快速提炼核心内容，再按更易读的方式帮你整理。";
  }

  return "收到，我先帮你起一版结果，你可以继续追问或改稿。";
}

function upsertRecent(prompt: string, status: string) {
  const title = buildTitle(prompt);
  const existingIndex = state.recentConversations.findIndex(
    (item) => item.prompt === prompt
  );

  const nextItem: RecentConversation = {
    id:
      existingIndex >= 0
        ? state.recentConversations[existingIndex].id
        : nextId("recent"),
    title,
    subtitle: "刚刚",
    status,
    prompt
  };

  if (existingIndex >= 0) {
    state.recentConversations.splice(existingIndex, 1);
  }

  state.recentConversations.unshift(nextItem);
}

function pushUserMessage(prompt: string) {
  state.messages = [
    ...state.messages,
    {
      id: nextId("user"),
      kind: "user",
      role: "user",
      text: prompt
    }
  ];
}

function appendAssistantDelta(runId: string, delta: string) {
  if (!delta) {
    return;
  }

  const lastMessage = state.messages[state.messages.length - 1];
  if (
    lastMessage?.kind === "assistant" &&
    lastMessage.role === "assistant" &&
    lastMessage.runId === runId
  ) {
    lastMessage.text += delta;
    return;
  }

  state.messages = [
    ...state.messages,
    {
      id: nextId("assistant"),
      kind: "assistant",
      role: "assistant",
      text: delta,
      runId
    }
  ];
}

function appendArtifactMessage(
  runId: string,
  artifact: ArtifactResult["artifact"] & { downloadUrl: string }
) {
  const lastMessage = state.messages[state.messages.length - 1];
  if (
    lastMessage?.kind === "artifact" &&
    lastMessage.runId === runId &&
    lastMessage.artifact.downloadUrl === artifact.downloadUrl
  ) {
    return;
  }

  state.messages = [
    ...state.messages,
    {
      id: nextId("artifact"),
      kind: "artifact",
      artifact,
      runId
    }
  ];
}

function replacePendingAttachment(
  clientId: string,
  nextAttachment: PendingAttachment
) {
  state.pendingAttachments = state.pendingAttachments.map((attachment) =>
    attachment.clientId === clientId ? nextAttachment : attachment
  );
}

function extractArtifactFromResult(
  result: Extract<TaskStreamEvent, { type: "task.result.created" }>["result"]
) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const record = result as {
    type?: unknown;
    artifact?: unknown;
  };

  if (record.type !== "artifact" || !record.artifact || typeof record.artifact !== "object") {
    return null;
  }

  const artifact = record.artifact as Partial<ArtifactResult["artifact"]>;
  if (
    (artifact.kind === "excel" || artifact.kind === "pdf" || artifact.kind === "docx") &&
    typeof artifact.fileName === "string" &&
    typeof artifact.mimeType === "string" &&
    typeof artifact.downloadUrl === "string" &&
    typeof artifact.previewText === "string"
  ) {
    return artifact as ArtifactResult["artifact"] & { downloadUrl: string };
  }

  return null;
}

export const taskStore = {
  getSnapshot() {
    return snapshot;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setDraft(text: string) {
    state.draft = text;
    emit();
  },
  beginPendingAttachment(input: {
    filename: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    const clientId = nextId("attachment");
    state.pendingAttachments = [
      ...state.pendingAttachments,
      {
        clientId,
        filename: input.filename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        status: "uploading"
      }
    ];
    emit();
    return clientId;
  },
  completePendingAttachment(clientId: string, file: FileRecord) {
    replacePendingAttachment(clientId, {
      clientId,
      fileId: file.fileId,
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      status: file.status,
      storageKey: file.storageKey
    });
    emit();
  },
  failPendingAttachment(clientId: string, errorMessage: string) {
    const current = state.pendingAttachments.find(
      (attachment) => attachment.clientId === clientId
    );
    if (!current) {
      return;
    }

    replacePendingAttachment(clientId, {
      ...current,
      status: "failed",
      errorMessage
    });
    emit();
  },
  removePendingAttachment(clientId: string) {
    state.pendingAttachments = state.pendingAttachments.filter(
      (attachment) => attachment.clientId !== clientId
    );
    emit();
  },
  getUploadedPendingFileIds() {
    return state.pendingAttachments
      .filter(
        (attachment) =>
          attachment.status === "uploaded" && typeof attachment.fileId === "string"
      )
      .map((attachment) => attachment.fileId as string);
  },
  startConversation(text: string) {
    const prompt = text.trim();
    if (!prompt) {
      return;
    }

    state.lastSubmittedTaskText = prompt;
    state.submitCount += 1;
    state.draft = "";
    state.currentTaskId = null;
    state.currentSessionId = null;
    state.currentStatus = "queued";
    state.currentError = null;
    state.currentTitle = buildTitle(prompt);
    state.currentRunId = null;
    state.pendingAttachments = [];
    state.resultVersions = [];
    state.selectedVersionNo = null;
    state.messages = [
      {
        id: nextId("user"),
        kind: "user",
        role: "user",
        text: prompt
      }
    ];
    upsertRecent(prompt, "处理中");
    emit();
  },
  appendFollowUp(text: string) {
    const prompt = text.trim();
    if (!prompt) {
      return;
    }

    state.lastSubmittedTaskText = prompt;
    state.submitCount += 1;
    state.draft = "";
    state.currentTaskId = null;
    state.currentStatus = "queued";
    state.currentError = null;
    state.currentRunId = null;
    state.pendingAttachments = [];
    pushUserMessage(prompt);
    upsertRecent(prompt, "处理中");
    emit();
  },
  resumeConversation(item: RecentConversation) {
    state.currentTaskId = null;
    state.currentSessionId = null;
    state.currentStatus = item.status;
    state.currentError = null;
    state.currentTitle = item.title;
    state.currentRunId = null;
    state.lastSubmittedTaskText = item.prompt;
    state.pendingAttachments = [];
    state.messages = [
      {
        id: nextId("user"),
        kind: "user",
        role: "user",
        text: item.prompt
      },
      {
        id: nextId("assistant"),
        kind: "assistant",
        role: "assistant",
        text: buildAssistantPreview(item.prompt)
      }
    ];
    emit();
  },
  setExecutionMeta(input: {
    taskId: string;
    sessionId: string;
    initialStatus: string;
    errorMessage?: string;
  }) {
    state.currentTaskId = input.taskId;
    state.currentSessionId = input.sessionId;
    state.currentStatus = input.initialStatus;
    state.currentError = input.errorMessage ?? null;
    if (state.recentConversations[0]) {
      state.recentConversations[0].id = input.taskId;
      state.recentConversations[0].sessionId = input.sessionId;
      state.recentConversations[0].status = input.initialStatus;
    }
    emit();
  },
  applyStreamEvent(event: TaskStreamEvent) {
    state.currentTaskId = event.taskId;
    state.currentSessionId = event.sessionId;
    state.currentRunId = event.runId;

    if (event.type === "task.accepted") {
      state.currentStatus = "running";
      if (state.recentConversations[0]) {
        state.recentConversations[0].status = "处理中";
      }
      emit();
      return;
    }

    if (event.type === "task.stage.changed") {
      state.currentStatus = "running";
      emit();
      return;
    }

    if (event.type === "task.result.created") {
      state.currentStatus = "running";
      const artifact = extractArtifactFromResult(event.result);
      if (artifact) {
        appendArtifactMessage(event.runId, artifact);
      }
      emit();
      return;
    }

    if (event.type === "task.delta") {
      state.currentStatus = "running";
      appendAssistantDelta(event.runId, event.delta);
      emit();
      return;
    }

    if (event.type === "task.completed") {
      state.currentStatus = "completed";
      if (state.recentConversations[0]) {
        state.recentConversations[0].status = "已完成";
      }
      emit();
      return;
    }

    if (event.type === "task.cancelled") {
      state.currentStatus = "cancelled";
      state.currentError = null;
      if (state.recentConversations[0]) {
        state.recentConversations[0].status = "已取消";
      }
      emit();
      return;
    }

    state.currentStatus = "failed";
    state.currentError = event.message;
    if (state.recentConversations[0]) {
      state.recentConversations[0].status = "失败";
    }
    emit();
  },
  setTaskError(message: string) {
    state.currentStatus = "failed";
    state.currentError = message;
    if (state.recentConversations[0]) {
      state.recentConversations[0].status = "失败";
    }
    emit();
  },
  beginRetry() {
    state.currentStatus = "queued";
    state.currentError = null;
    emit();
  },
  markCancelled() {
    state.currentStatus = "cancelled";
    state.currentError = null;
    if (state.recentConversations[0]) state.recentConversations[0].status = "已取消";
    emit();
  },
  recoverActiveTask(task: {
    id: string;
    sessionId: string;
    inputText: string;
    status: string;
  }) {
    if (state.currentTaskId === task.id) return;
    state.currentTaskId = task.id;
    state.currentSessionId = task.sessionId;
    state.currentStatus = task.status;
    state.currentError = null;
    state.currentTitle = buildTitle(task.inputText);
    state.currentRunId = null;
    state.lastSubmittedTaskText = task.inputText;
    state.pendingAttachments = [];
    state.messages = [{
      id: `user-${task.id}`,
      kind: "user",
      role: "user",
      text: task.inputText
    }];
    emit();
  },
  hydrateRecentConversations(items: RecentConversation[]) {
    state.recentConversations = items;
    emit();
  },
  appendRecentConversations(items: RecentConversation[]) {
    const existing = new Set(state.recentConversations.map((item) => item.id));
    state.recentConversations = [
      ...state.recentConversations,
      ...items.filter((item) => !existing.has(item.id))
    ];
    emit();
  },
  removeRecentConversation(taskId: string) {
    state.recentConversations = state.recentConversations.filter(
      (item) => item.id !== taskId
    );
    emit();
  },
  hydrateServerConversation(detail: HistoryTaskDetail) {
    const messages: ConversationMessage[] = [];
    for (const task of detail.tasks) {
      messages.push({
        id: `user-${task.taskId}`,
        kind: "user",
        role: "user",
        text: task.inputText
      });
      if (task.result?.outputText) {
        messages.push({
          id: `assistant-${task.taskId}`,
          kind: "assistant",
          role: "assistant",
          text: task.result.outputText,
          runId: task.taskId
        });
      }
      const artifact = task.result
        ? extractArtifactFromResult(
            task.result.outputJson as Extract<
              TaskStreamEvent,
              { type: "task.result.created" }
            >["result"]
          )
        : null;
      if (artifact) {
        messages.push({
          id: `artifact-${task.taskId}`,
          kind: "artifact",
          artifact,
          runId: task.taskId
        });
      }
    }

    const latestTask = detail.tasks[detail.tasks.length - 1];
    state.currentTaskId = detail.currentTaskId ?? latestTask?.taskId ?? null;
    state.currentSessionId = detail.sessionId;
    state.currentStatus = latestTask?.status ?? detail.status;
    state.currentError = latestTask?.errorMessage ?? null;
    state.currentTitle = detail.title;
    state.currentRunId = null;
    state.lastSubmittedTaskText = latestTask?.inputText ?? null;
    state.pendingAttachments = [];
    state.messages = messages;
    state.resultVersions = [...detail.versions];
    state.selectedVersionNo = detail.versions.at(-1)?.versionNo ?? null;
    emit();
  },
  setResultVersions(versions: TaskResultVersion[]) {
    state.resultVersions = [...versions];
    state.selectedVersionNo = versions.at(-1)?.versionNo ?? null;
    emit();
  },
  selectResultVersion(versionNo: number) {
    if (!state.resultVersions.some((version) => version.versionNo === versionNo)) return;
    state.selectedVersionNo = versionNo;
    emit();
  },
  reset() {
    state.draft = initialState.draft;
    state.lastSubmittedTaskText = initialState.lastSubmittedTaskText;
    state.submitCount = initialState.submitCount;
    state.currentTaskId = initialState.currentTaskId;
    state.currentSessionId = initialState.currentSessionId;
    state.currentStatus = initialState.currentStatus;
    state.currentError = initialState.currentError;
    state.currentTitle = initialState.currentTitle;
    state.currentRunId = initialState.currentRunId;
    state.messages = [...initialState.messages];
    state.pendingAttachments = [...initialState.pendingAttachments];
    state.recentConversations = [...initialState.recentConversations];
    state.resultVersions = [...initialState.resultVersions];
    state.selectedVersionNo = initialState.selectedVersionNo;
    emit();
  }
};
