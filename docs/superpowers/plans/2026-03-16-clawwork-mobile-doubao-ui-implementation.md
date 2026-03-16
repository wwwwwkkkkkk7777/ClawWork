# ClawWork Mobile Doubao UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the ClawWork mobile app so home, conversation, history, and settings all follow a Doubao-inspired mobile interaction model while preserving existing task APIs and stream flows.

**Architecture:** Keep the current Expo app and existing service/store/API wiring, but replace the shell with a home-led navigation model and a shared mobile design language built from focused reusable components. Use small, stateful local navigation instead of introducing a new navigation library, and reconnect the existing task creation and stream data into the new conversation-first experience after the visual shell is in place.

**Tech Stack:** Expo React Native, TypeScript, Jest Expo, React Native Testing Library, existing ClawWork mobile stores/services, existing mobile-api REST/SSE endpoints

---

## File Structure

Existing mobile files to reuse:

- `apps/mobile/App.tsx`: app bootstrap
- `apps/mobile/index.js`: Expo root entry
- `apps/mobile/src/navigation/RootNavigator.tsx`: current top-level screen switch point
- `apps/mobile/src/screens/HomeScreen.tsx`: current home shell, will be fully rebuilt
- `apps/mobile/src/screens/ConversationScreen.tsx`: current conversation placeholder, will be fully rebuilt
- `apps/mobile/src/screens/HistoryScreen.tsx`: current history placeholder, will be fully rebuilt
- `apps/mobile/src/screens/SettingsScreen.tsx`: current settings placeholder, will be fully rebuilt
- `apps/mobile/src/components/InputBar.tsx`: current input component, will become the floating Doubao-style input
- `apps/mobile/src/components/ResultCard.tsx`: current assistant card seed, may be split or narrowed
- `apps/mobile/src/services/tasks.ts`: existing task create/list calls
- `apps/mobile/src/services/stream.ts`: existing stream URL builder
- `apps/mobile/src/store/taskStore.ts`: existing task draft store
- `apps/mobile/src/store/streamStore.ts`: existing stream event store
- `apps/mobile/src/test/HomeScreen.test.tsx`: home rendering tests
- `apps/mobile/src/test/task-flow.test.tsx`: current task flow smoke test

New files to introduce:

- `apps/mobile/src/theme/tokens.ts`: shared spacing, radius, color, shadow, and type tokens
- `apps/mobile/src/navigation/routeStore.ts`: simple local navigation state for home-led flow
- `apps/mobile/src/components/QuickChip.tsx`: reusable horizontal pill
- `apps/mobile/src/components/CapabilityCard.tsx`: reusable home capability card
- `apps/mobile/src/components/RecentConversationCard.tsx`: reusable recent/history list card
- `apps/mobile/src/components/ConversationHeader.tsx`: Doubao-style conversation top bar
- `apps/mobile/src/components/MessageBubble.tsx`: user bubble
- `apps/mobile/src/components/AssistantActionRow.tsx`: low-emphasis action icon row
- `apps/mobile/src/components/AssistantMessageCard.tsx`: assistant message card shell
- `apps/mobile/src/components/SettingsGroupCard.tsx`: grouped settings surface
- `apps/mobile/src/test/navigation-shell.test.tsx`: navigation shell proof
- `apps/mobile/src/test/conversation-screen.test.tsx`: conversation layout proof
- `apps/mobile/src/test/history-settings.test.tsx`: history/settings rendering proof

Keep files focused:

- navigation logic stays in `src/navigation/**`
- styling primitives stay in `src/theme/**`
- screen-specific composition stays in `src/screens/**`
- shared UI blocks stay in `src/components/**`
- network/service code stays in `src/services/**`
- transient route/task/stream state stays in `src/store/**`

Use `@superpowers:test-driven-development` for every task and `@superpowers:verification-before-completion` before closing the plan.

## Chunk 1: Navigation Shell And Shared Tokens

### Task 1: Add shared mobile tokens and a home-led route shell

**Files:**
- Create: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/navigation/routeStore.ts`
- Modify: `apps/mobile/App.tsx`
- Modify: `apps/mobile/src/navigation/RootNavigator.tsx`
- Test: `apps/mobile/src/test/navigation-shell.test.tsx`

- [ ] **Step 1: Write the failing navigation shell test**

```tsx
// apps/mobile/src/test/navigation-shell.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";

describe("RootNavigator", () => {
  it("renders home by default and can switch to history/settings", () => {
    routeStore.reset();
    render(<RootNavigator />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();

    routeStore.navigate("history");
    expect(screen.getByText("历史记录")).toBeTruthy();

    routeStore.navigate("settings");
    expect(screen.getByText("设置")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- navigation-shell.test.tsx
```

Expected:

- test fails because `routeStore` does not exist and the current root navigator always renders only `HomeScreen`

- [ ] **Step 3: Write the minimal route shell and token module**

```ts
// apps/mobile/src/navigation/routeStore.ts
export type AppRoute = "home" | "conversation" | "history" | "settings";

type RouteState = {
  current: AppRoute;
};

const state: RouteState = {
  current: "home"
};

export const routeStore = {
  getState() {
    return state;
  },
  navigate(next: AppRoute) {
    state.current = next;
  },
  reset() {
    state.current = "home";
  }
};
```

```ts
// apps/mobile/src/theme/tokens.ts
export const tokens = {
  colors: {
    canvas: "#f6f7fb",
    surface: "#ffffff",
    surfaceMuted: "#f8fafc",
    text: "#111827",
    textMuted: "#8b8f98",
    accent: "#1d6cff",
    border: "#eef2f7"
  },
  radius: {
    card: 24,
    bubble: 22,
    pill: 999
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- navigation-shell.test.tsx
pnpm --filter @clawwork/mobile build
```

Expected:

- navigation shell test passes
- mobile TypeScript build passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/App.tsx apps/mobile/src/navigation/RootNavigator.tsx apps/mobile/src/navigation/routeStore.ts apps/mobile/src/theme/tokens.ts apps/mobile/src/test/navigation-shell.test.tsx
git commit -m "feat: add mobile home-led navigation shell"
```

## Chunk 2: Home Screen And Shared Entry Components

### Task 2: Build the Doubao-style floating input bar and entry components

**Files:**
- Modify: `apps/mobile/src/components/InputBar.tsx`
- Create: `apps/mobile/src/components/QuickChip.tsx`
- Create: `apps/mobile/src/components/CapabilityCard.tsx`
- Create: `apps/mobile/src/components/RecentConversationCard.tsx`
- Test: `apps/mobile/src/test/HomeScreen.test.tsx`

- [ ] **Step 1: Rewrite the home test to prove the new entry components**

```tsx
// apps/mobile/src/test/HomeScreen.test.tsx
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { HomeScreen } from "../screens/HomeScreen";

describe("HomeScreen", () => {
  it("renders Doubao-style entry content", () => {
    render(<HomeScreen />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();
    expect(screen.getByText("总结文档")).toBeTruthy();
    expect(screen.getByText("会议纪要")).toBeTruthy();
    expect(screen.getByText("最近对话")).toBeTruthy();
    expect(screen.getByPlaceholderText("发送消息或按住说话…")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- HomeScreen.test.tsx
```

Expected:

- test fails because the current home screen is a centered placeholder and the current input bar does not match the new placeholder or structure

- [ ] **Step 3: Write the shared entry components**

```tsx
// apps/mobile/src/components/QuickChip.tsx
import { Pressable, Text } from "react-native";

export function QuickChip(props: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={props.onPress}>
      <Text>{props.label}</Text>
    </Pressable>
  );
}
```

```tsx
// apps/mobile/src/components/InputBar.tsx
import { Pressable, TextInput, View } from "react-native";

export function InputBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <View>
      <TextInput
        placeholder="发送消息或按住说话…"
        value={props.value}
        onChangeText={props.onChangeText}
      />
      <Pressable accessibilityLabel="voice placeholder" />
      <Pressable accessibilityLabel="more actions" />
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- HomeScreen.test.tsx
```

Expected:

- home test passes with the new copy and entry component surfaces

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/InputBar.tsx apps/mobile/src/components/QuickChip.tsx apps/mobile/src/components/CapabilityCard.tsx apps/mobile/src/components/RecentConversationCard.tsx apps/mobile/src/test/HomeScreen.test.tsx
git commit -m "feat: add Doubao-style mobile entry components"
```

### Task 3: Rebuild the home screen as the primary entry point

**Files:**
- Modify: `apps/mobile/src/screens/HomeScreen.tsx`
- Modify: `apps/mobile/src/store/taskStore.ts`
- Modify: `apps/mobile/src/navigation/routeStore.ts`
- Modify: `apps/mobile/src/test/task-flow.test.tsx`

- [ ] **Step 1: Write the failing home-to-conversation flow test**

```tsx
// apps/mobile/src/test/task-flow.test.tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";

describe("mobile task flow", () => {
  it("starts from home and enters conversation after send", () => {
    routeStore.reset();
    render(<RootNavigator />);

    fireEvent.changeText(screen.getByPlaceholderText("发送消息或按住说话…"), "帮我整理会议纪要");
    fireEvent.press(screen.getByLabelText("send message"));

    expect(screen.getByText("新对话")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
```

Expected:

- test fails because send does not navigate into the conversation shell yet

- [ ] **Step 3: Write the minimal home implementation**

```tsx
// apps/mobile/src/screens/HomeScreen.tsx
const quickActions = ["总结文档", "周报生成", "写邮件"];

export function HomeScreen() {
  const [text, setText] = useState(taskStore.getState().draft);

  return (
    <View>
      <Text>今天想让我帮你做什么？</Text>
      {quickActions.map((label) => (
        <QuickChip key={label} label={label} onPress={() => taskStore.setDraft(label)} />
      ))}
      <InputBar
        value={text}
        onChangeText={(next) => {
          setText(next);
          taskStore.setDraft(next);
        }}
        onSend={() => {
          taskStore.submitDraft(text);
          routeStore.navigate("conversation");
        }}
      />
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
pnpm --filter @clawwork/mobile test -- HomeScreen.test.tsx
```

Expected:

- home-to-conversation flow passes
- home rendering test still passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/HomeScreen.tsx apps/mobile/src/store/taskStore.ts apps/mobile/src/navigation/routeStore.ts apps/mobile/src/test/task-flow.test.tsx
git commit -m "feat: rebuild mobile home as primary entry point"
```

## Chunk 3: Conversation Screen And Task/Stream Rewiring

### Task 4: Add the Doubao-style conversation visual system

**Files:**
- Create: `apps/mobile/src/components/ConversationHeader.tsx`
- Create: `apps/mobile/src/components/MessageBubble.tsx`
- Create: `apps/mobile/src/components/AssistantActionRow.tsx`
- Create: `apps/mobile/src/components/AssistantMessageCard.tsx`
- Modify: `apps/mobile/src/components/ResultCard.tsx`
- Modify: `apps/mobile/src/screens/ConversationScreen.tsx`
- Test: `apps/mobile/src/test/conversation-screen.test.tsx`

- [ ] **Step 1: Write the failing conversation screen test**

```tsx
// apps/mobile/src/test/conversation-screen.test.tsx
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { ConversationScreen } from "../screens/ConversationScreen";

describe("ConversationScreen", () => {
  it("renders Doubao-style conversation chrome", () => {
    render(<ConversationScreen />);

    expect(screen.getByText("新对话")).toBeTruthy();
    expect(screen.getByText("内容由 AI 生成")).toBeTruthy();
    expect(screen.getByText("你好")).toBeTruthy();
    expect(screen.getByText("快速")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- conversation-screen.test.tsx
```

Expected:

- test fails because the conversation screen is still a placeholder result-card page

- [ ] **Step 3: Write the minimal conversation components**

```tsx
// apps/mobile/src/components/MessageBubble.tsx
import { Text, View } from "react-native";

export function MessageBubble(props: { role: "user" | "assistant"; text: string }) {
  return (
    <View>
      <Text>{props.text}</Text>
    </View>
  );
}
```

```tsx
// apps/mobile/src/screens/ConversationScreen.tsx
const toolChips = ["快速", "总结文档", "拍题答疑"];

export function ConversationScreen() {
  return (
    <View>
      <ConversationHeader title="新对话" subtitle="内容由 AI 生成" />
      <MessageBubble role="user" text="你好" />
      <AssistantMessageCard text="你好呀！很高兴认识你😊" />
      {toolChips.map((label) => (
        <QuickChip key={label} label={label} />
      ))}
      <InputBar value="" onChangeText={() => {}} onSend={() => {}} />
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- conversation-screen.test.tsx
pnpm --filter @clawwork/mobile build
```

Expected:

- conversation screen test passes
- mobile build passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ConversationHeader.tsx apps/mobile/src/components/MessageBubble.tsx apps/mobile/src/components/AssistantActionRow.tsx apps/mobile/src/components/AssistantMessageCard.tsx apps/mobile/src/components/ResultCard.tsx apps/mobile/src/screens/ConversationScreen.tsx apps/mobile/src/test/conversation-screen.test.tsx
git commit -m "feat: add Doubao-style conversation UI"
```

### Task 5: Reconnect task creation and stream flow to the new conversation shell

**Files:**
- Modify: `apps/mobile/src/services/tasks.ts`
- Modify: `apps/mobile/src/services/stream.ts`
- Modify: `apps/mobile/src/store/taskStore.ts`
- Modify: `apps/mobile/src/store/streamStore.ts`
- Modify: `apps/mobile/src/screens/HomeScreen.tsx`
- Modify: `apps/mobile/src/screens/ConversationScreen.tsx`
- Test: `apps/mobile/src/test/task-flow.test.tsx`

- [ ] **Step 1: Strengthen the task-flow test to prove data handoff**

```tsx
// apps/mobile/src/test/task-flow.test.tsx
it("submits from home and shows the submitted text in conversation", async () => {
  routeStore.reset();
  render(<RootNavigator />);

  fireEvent.changeText(screen.getByPlaceholderText("发送消息或按住说话…"), "帮我整理会议纪要");
  fireEvent.press(screen.getByLabelText("send message"));

  expect(await screen.findByText("帮我整理会议纪要")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
```

Expected:

- test fails because the conversation screen is not yet reading the submitted task state

- [ ] **Step 3: Write the minimal wiring**

```ts
// apps/mobile/src/store/taskStore.ts
type TaskState = {
  draft: string;
  lastSubmittedTaskText: string | null;
  currentTaskId: string | null;
};
```

```tsx
// apps/mobile/src/screens/ConversationScreen.tsx fragment
const currentText = taskStore.getState().lastSubmittedTaskText ?? "你好";
<MessageBubble role="user" text={currentText} />
```

```ts
// apps/mobile/src/store/streamStore.ts
type StreamEvent = {
  type: string;
  taskId: string;
  timestamp: string;
  delta?: string;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- task-flow.test.tsx
pnpm --filter @clawwork/mobile test -- conversation-screen.test.tsx
```

Expected:

- task-flow test passes with the submitted task text visible in the conversation view
- conversation screen test remains green

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/services/tasks.ts apps/mobile/src/services/stream.ts apps/mobile/src/store/taskStore.ts apps/mobile/src/store/streamStore.ts apps/mobile/src/screens/HomeScreen.tsx apps/mobile/src/screens/ConversationScreen.tsx apps/mobile/src/test/task-flow.test.tsx
git commit -m "feat: wire mobile task state into redesigned conversation flow"
```

## Chunk 4: History, Settings, And Final Verification

### Task 6: Rebuild the history screen as a lightweight conversation archive

**Files:**
- Modify: `apps/mobile/src/screens/HistoryScreen.tsx`
- Modify: `apps/mobile/src/services/tasks.ts`
- Create: `apps/mobile/src/test/history-settings.test.tsx`
- Reuse: `apps/mobile/src/components/RecentConversationCard.tsx`

- [ ] **Step 1: Write the failing history render test**

```tsx
// apps/mobile/src/test/history-settings.test.tsx
import { render, screen } from "@testing-library/react-native";
import { describe, expect, it } from "@jest/globals";
import { HistoryScreen } from "../screens/HistoryScreen";

describe("HistoryScreen", () => {
  it("renders the lightweight archive title and cards", () => {
    render(<HistoryScreen />);
    expect(screen.getByText("历史记录")).toBeTruthy();
    expect(screen.getByText("客户会议纪要")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- history-settings.test.tsx
```

Expected:

- test fails because the history screen is still a placeholder text page

- [ ] **Step 3: Write the minimal history implementation**

```tsx
// apps/mobile/src/screens/HistoryScreen.tsx
const items = [
  { title: "客户会议纪要", subtitle: "昨天 18:42" },
  { title: "邮件草稿", subtitle: "周一" }
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @clawwork/mobile test -- history-settings.test.tsx
```

Expected:

- history test passes

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/HistoryScreen.tsx apps/mobile/src/services/tasks.ts apps/mobile/src/test/history-settings.test.tsx
git commit -m "feat: redesign mobile history screen"
```

### Task 7: Rebuild the settings screen and finish emulator verification

**Files:**
- Modify: `apps/mobile/src/screens/SettingsScreen.tsx`
- Create: `apps/mobile/src/components/SettingsGroupCard.tsx`
- Modify: `apps/mobile/src/test/history-settings.test.tsx`
- Modify: `apps/mobile/README.md`

- [ ] **Step 1: Extend the failing test to cover settings groups**

```tsx
// apps/mobile/src/test/history-settings.test.tsx
import { SettingsScreen } from "../screens/SettingsScreen";

describe("SettingsScreen", () => {
  it("renders grouped assistant-style settings", () => {
    render(<SettingsScreen />);
    expect(screen.getByText("设置")).toBeTruthy();
    expect(screen.getByText("输出风格")).toBeTruthy();
    expect(screen.getByText("模型网关")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @clawwork/mobile test -- history-settings.test.tsx
```

Expected:

- settings assertions fail because the current screen only shows the raw API base URL

- [ ] **Step 3: Write the minimal settings implementation and update the runbook**

```tsx
// apps/mobile/src/screens/SettingsScreen.tsx
const preferenceRows = [
  { label: "输出风格", value: "默认" },
  { label: "偏好语言", value: "简体中文" }
];
```

```md
<!-- apps/mobile/README.md -->
- Home is the primary entry point.
- History and settings are secondary destinations.
- Use `pnpm --filter @clawwork/mobile start -- --clear` after major shell changes.
```

- [ ] **Step 4: Run the final verification**

Run:

```bash
pnpm --filter @clawwork/mobile test
pnpm --filter @clawwork/mobile build
pnpm --filter @clawwork/mobile start -- --clear
```

Expected:

- all mobile tests pass
- TypeScript build passes
- Expo opens without the earlier entry-resolution error
- manual emulator check confirms the redesigned home, conversation, history, and settings screens render without layout breakage

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/SettingsScreen.tsx apps/mobile/src/components/SettingsGroupCard.tsx apps/mobile/src/test/history-settings.test.tsx apps/mobile/README.md
git commit -m "feat: finish Doubao-style mobile redesign"
```

Plan review note:

- The harness available in this session does not expose plan-review subagents, so perform a manual review after writing and before execution.
- Manual review must confirm: file paths are current, no backend redesign is implied, navigation stays home-led, and the testing commands match the existing Expo/Jest setup.

Execution order note:

1. Complete Chunk 1 before changing any screen composition.
2. Complete Chunk 2 before wiring real task flow into the new conversation surface.
3. Complete Chunk 3 before touching history and settings.
4. Complete Chunk 4 before considering the redesign done.
