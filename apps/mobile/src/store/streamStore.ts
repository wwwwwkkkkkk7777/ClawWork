type StreamEvent = {
  type: string;
  taskId: string;
  timestamp: string;
};

const events: StreamEvent[] = [];

export const streamStore = {
  getEvents() {
    return events;
  },
  push(event: StreamEvent) {
    events.push(event);
  },
  reset() {
    events.length = 0;
  }
};
