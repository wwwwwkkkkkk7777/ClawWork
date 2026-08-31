import { act } from "@testing-library/react-native";
import { subscribeTaskStream } from "../services/stream";
import { authStore } from "../store/authStore";

class FakeXmlHttpRequest {
  static instances: FakeXmlHttpRequest[] = [];

  responseText = "";
  readyState = 0;
  status = 200;
  headers: Record<string, string> = {};
  onprogress: (() => void) | null = null;
  onreadystatechange: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeXmlHttpRequest.instances.push(this);
  }

  open() {
    this.readyState = 1;
  }

  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  send() {}

  abort() {}

  push(rawEvent: string) {
    this.responseText += rawEvent;
    this.readyState = 3;
    this.onprogress?.();
  }

  fail() {
    this.onerror?.();
  }
}

describe("task SSE reconnect", () => {
  const originalXhr = global.XMLHttpRequest;

  afterEach(() => {
    global.XMLHttpRequest = originalXhr;
    FakeXmlHttpRequest.instances = [];
    authStore.clear();
    jest.useRealTimers();
  });

  it("reconnects with bearer auth and the last persisted event id", () => {
    jest.useFakeTimers();
    global.XMLHttpRequest = FakeXmlHttpRequest as unknown as typeof XMLHttpRequest;
    authStore.setSession({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      userId: "user-1",
      email: null,
      nickname: "User"
    });
    const onEvent = jest.fn();
    const onComplete = jest.fn();

    const subscription = subscribeTaskStream("task-1", { onEvent, onComplete });
    const first = FakeXmlHttpRequest.instances[0];
    expect(first?.headers.Authorization).toBe("Bearer access-1");
    first?.push(
      `id: 7\ndata: ${JSON.stringify({
        type: "task.accepted",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        timestamp: "2026-08-31T00:00:00.000Z"
      })}\n\n`
    );
    first?.fail();

    act(() => {
      jest.advanceTimersByTime(400);
    });
    const second = FakeXmlHttpRequest.instances[1];
    expect(second?.headers["Last-Event-ID"]).toBe("7");
    expect(second?.headers.Authorization).toBe("Bearer access-1");
    second?.push(
      `id: 8\ndata: ${JSON.stringify({
        type: "task.completed",
        taskId: "task-1",
        sessionId: "session-1",
        runId: "run-1",
        timestamp: "2026-08-31T00:00:01.000Z"
      })}\n\n`
    );

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledTimes(1);
    subscription.close();
  });
});
