import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  View
} from "react-native";
import { AssistantMessageCard } from "../components/AssistantMessageCard";
import { ConversationHeader } from "../components/ConversationHeader";
import { InputBar } from "../components/InputBar";
import { MessageBubble } from "../components/MessageBubble";
import { QuickChip } from "../components/QuickChip";
import { routeStore } from "../navigation/routeStore";
import { createTask, followUpTask } from "../services/tasks";
import {
  subscribeTaskStream,
  type TaskStreamSubscription
} from "../services/stream";
import { streamStore } from "../store/streamStore";
import { taskStore } from "../store/taskStore";
import { tokens } from "../theme/tokens";

const toolChips = ["快速", "总结文档", "拍题答疑"];

export function ConversationScreen() {
  const topOffset =
    Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) + 10 : 16;
  const [draft, setDraft] = useState("");
  const activeSubscriptionRef = useRef<TaskStreamSubscription | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const taskState = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot
  );

  useEffect(() => {
    const taskId = taskState.currentTaskId;
    if (!taskId) {
      return;
    }

    if (
      taskState.currentStatus !== "queued" &&
      taskState.currentStatus !== "running"
    ) {
      return;
    }

    if (activeTaskIdRef.current === taskId) {
      return;
    }

    activeSubscriptionRef.current?.close();
    activeTaskIdRef.current = taskId;

    const subscription = subscribeTaskStream(taskId, {
      onEvent: (event) => {
        streamStore.push({
          type: event.type,
          taskId: event.taskId,
          timestamp: event.timestamp,
          delta: "delta" in event ? event.delta : undefined
        });
        taskStore.applyStreamEvent(event);
      },
      onError: (error) => {
        taskStore.setTaskError(error.message);
      },
      onComplete: () => {
        if (activeTaskIdRef.current === taskId) {
          activeTaskIdRef.current = null;
          activeSubscriptionRef.current = null;
        }
      }
    });

    activeSubscriptionRef.current = subscription;

    return () => {
      if (activeTaskIdRef.current === taskId) {
        activeTaskIdRef.current = null;
      }
      if (activeSubscriptionRef.current === subscription) {
        activeSubscriptionRef.current = null;
      }
      subscription.close();
    };
  }, [taskState.currentTaskId, taskState.currentStatus]);

  const title =
    taskState.currentTitle && taskState.currentTitle !== "新对话"
      ? taskState.currentTitle
      : "新对话";

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    taskStore.appendFollowUp(text);
    setDraft("");

    const payload = {
      input: { text, fileIds: [] },
      preferredTone: "default",
      preferredLength: "medium"
    };

    try {
      const result = taskState.currentTaskId
        ? await followUpTask(taskState.currentTaskId, payload)
        : await createTask(payload);
      taskStore.setExecutionMeta(result);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "任务创建失败，请稍后重试";
      taskStore.setTaskError(message);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { paddingTop: topOffset }]}>
      <ConversationHeader
        title={title}
        subtitle="内容由 AI 生成"
        onBack={() => routeStore.navigate("home")}
      />
      <ScrollView
        style={styles.stream}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
      >
        {taskState.messages.map((message) =>
          message.role === "user" ? (
            <MessageBubble key={message.id} role="user" text={message.text} />
          ) : (
            <AssistantMessageCard key={message.id} text={message.text} />
          )
        )}
      </ScrollView>

      <View testID="conversation-composer-dock" style={styles.composerDock}>
        <ScrollView
          horizontal
          style={styles.toolRail}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.toolRow}
        >
          {toolChips.map((label) => (
            <QuickChip key={label} label={label} onPress={() => setDraft(label)} />
          ))}
        </ScrollView>

        <InputBar value={draft} onChangeText={setDraft} onSend={sendMessage} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: tokens.colors.canvas
  },
  stream: {
    flex: 1
  },
  streamContent: {
    paddingTop: 4,
    paddingBottom: 6
  },
  composerDock: {
    gap: 6
  },
  toolRail: {
    flexGrow: 0
  },
  toolRow: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 2
  }
});
