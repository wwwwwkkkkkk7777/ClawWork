type TaskState = {
  draft: string;
  lastSubmittedTaskText: string | null;
  submitCount: number;
};

const state: TaskState = {
  draft: "",
  lastSubmittedTaskText: null,
  submitCount: 0
};

export const taskStore = {
  getState() {
    return state;
  },
  setDraft(text: string) {
    state.draft = text;
  },
  submitDraft(text: string) {
    state.lastSubmittedTaskText = text;
    state.submitCount += 1;
    state.draft = "";
  }
};
