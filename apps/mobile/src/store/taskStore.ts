type Listener = () => void;

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

export type RecentConversation = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  prompt: string;
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
  messages: ConversationMessage[];
  recentConversations: RecentConversation[];
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
  messages: [
    {
      id: "welcome-assistant",
      role: "assistant",
      text: "你好呀！很高兴认识你😊"
    }
  ],
  recentConversations: [
    {
      id: "recent-1",
      title: "客户会议纪要",
      subtitle: "昨天 18:42",
      status: "已完成",
      prompt: "帮我整理这次客户会议纪要"
    },
    {
      id: "recent-2",
      title: "邮件草稿",
      subtitle: "周一",
      status: "草稿中",
      prompt: "帮我写一封跟进客户进度的邮件"
    }
  ]
};

const state: TaskState = {
  ...initialState,
  messages: [...initialState.messages],
  recentConversations: [...initialState.recentConversations]
};

let snapshot = createSnapshot();

function createSnapshot() {
  return {
    ...state,
    messages: [...state.messages],
    recentConversations: [...state.recentConversations]
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

function buildAssistantReply(text: string) {
  if (text.includes("你好")) {
    return "你好呀！很高兴认识你😊";
  }

  if (text.includes("会议") || text.includes("纪要")) {
    return "收到，我先帮你整理出会议纪要结构，再继续细化重点和待办。";
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
    state.messages = [
      {
        id: nextId("user"),
        role: "user",
        text: prompt
      },
      {
        id: nextId("assistant"),
        role: "assistant",
        text: buildAssistantReply(prompt)
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
    state.messages = [
      ...state.messages,
      {
        id: nextId("user"),
        role: "user",
        text: prompt
      },
      {
        id: nextId("assistant"),
        role: "assistant",
        text: buildAssistantReply(prompt)
      }
    ];
    upsertRecent(prompt, state.currentStatus ?? "处理中");
    emit();
  },
  resumeConversation(item: RecentConversation) {
    state.currentTitle = item.title;
    state.lastSubmittedTaskText = item.prompt;
    state.currentStatus = item.status;
    state.currentError = null;
    state.messages = [
      {
        id: nextId("user"),
        role: "user",
        text: item.prompt
      },
      {
        id: nextId("assistant"),
        role: "assistant",
        text: buildAssistantReply(item.prompt)
      }
    ];
    emit();
  },
  setExecutionMeta(input: {
    taskId: string;
    sessionId: string;
    initialStatus: string;
  }) {
    state.currentTaskId = input.taskId;
    state.currentSessionId = input.sessionId;
    state.currentStatus = input.initialStatus;
    if (state.recentConversations[0]) {
      state.recentConversations[0].status = input.initialStatus;
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
  hydrateRecentConversations(items: RecentConversation[]) {
    if (items.length === 0) {
      return;
    }

    state.recentConversations = items;
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
    state.messages = [...initialState.messages];
    state.recentConversations = [...initialState.recentConversations];
    emit();
  }
};
