type Listener = () => void;

export type StreamEvent = {
  type: string;
  taskId: string;
  timestamp: string;
  delta?: string;
};

const listeners = new Set<Listener>();
const events: StreamEvent[] = [];

let snapshot: StreamEvent[] = [];

function emit() {
  snapshot = [...events];
  listeners.forEach((listener) => listener());
}

export const streamStore = {
  getSnapshot() {
    return snapshot;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  push(event: StreamEvent) {
    events.push(event);
    emit();
  },
  reset() {
    events.length = 0;
    emit();
  }
};
