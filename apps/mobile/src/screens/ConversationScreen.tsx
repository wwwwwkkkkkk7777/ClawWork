import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View
} from "react-native";
import { ArtifactMessageCard } from "../components/ArtifactMessageCard";
import { AssistantMessageCard } from "../components/AssistantMessageCard";
import { ConversationHeader } from "../components/ConversationHeader";
import { InputBar } from "../components/InputBar";
import { MessageBubble } from "../components/MessageBubble";
import { PendingFileCard } from "../components/PendingFileCard";
import { QuickChip } from "../components/QuickChip";
import { ResultCard } from "../components/ResultCard";
import { routeStore } from "../navigation/routeStore";
import { deleteUploadedFile, pickAttachments, uploadAttachment } from "../services/files";
import {
  createTask,
  cancelTask,
  followUpTask,
  getTaskVersions,
  regenerateTask
} from "../services/tasks";
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
        if (event.type === "task.completed") {
          void getTaskVersions(taskId)
            .then((versions) => taskStore.setResultVersions(versions))
            .catch(() => undefined);
        }
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

  const attachFiles = async () => {
    const pickedFiles = await pickAttachments();

    for (const pickedFile of pickedFiles) {
      const clientId = taskStore.beginPendingAttachment({
        filename: pickedFile.filename,
        mimeType: pickedFile.mimeType,
        sizeBytes: pickedFile.sizeBytes
      });

      try {
        const uploadedFile = await uploadAttachment(pickedFile);
        taskStore.completePendingAttachment(clientId, uploadedFile);
      } catch (error: unknown) {
        taskStore.failPendingAttachment(
          clientId,
          error instanceof Error ? error.message : "上传失败"
        );
      }
    }
  };

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const fileIds = taskStore.getUploadedPendingFileIds();
    taskStore.appendFollowUp(text);
    setDraft("");

    const payload = {
      input: { text, fileIds }
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

  const removeAttachment = async (clientId: string, fileId?: string) => {
    taskStore.removePendingAttachment(clientId);
    if (fileId) {
      await deleteUploadedFile(fileId).catch(() => undefined);
    }
  };

  const retryTask = async () => {
    if (!taskState.currentTaskId) return;
    const failedTaskId = taskState.currentTaskId;
    taskStore.beginRetry();
    try {
      taskStore.setExecutionMeta(await regenerateTask(failedTaskId));
    } catch (caught) {
      taskStore.setTaskError(
        caught instanceof Error ? caught.message : "重试失败，请稍后再试"
      );
    }
  };

  const cancelCurrentTask = async () => {
    if (!taskState.currentTaskId) return;
    try {
      await cancelTask(taskState.currentTaskId);
      activeSubscriptionRef.current?.close();
      activeSubscriptionRef.current = null;
      activeTaskIdRef.current = null;
      taskStore.markCancelled();
    } catch (caught) {
      taskStore.setTaskError(
        caught instanceof Error ? caught.message : "取消失败，请稍后再试"
      );
    }
  };

  const selectedVersion = taskState.resultVersions.find(
    (version) => version.versionNo === taskState.selectedVersionNo
  );

  return (
    <SafeAreaView style={[styles.container, { paddingTop: topOffset }]}>
      <ConversationHeader
        title={title}
        subtitle="内容由 AI 生成"
        onBack={() => routeStore.navigate("home")}
      />

      {taskState.currentError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{taskState.currentError}</Text>
          <Pressable accessibilityRole="button" onPress={() => void retryTask()}>
            <Text style={styles.retryText}>重试任务</Text>
          </Pressable>
        </View>
      ) : null}

      {taskState.currentStatus === "queued" || taskState.currentStatus === "running" ? (
        <View style={styles.runningBanner}>
          <Text style={styles.runningText}>任务正在后台处理</Text>
          <Pressable accessibilityRole="button" onPress={() => void cancelCurrentTask()}>
            <Text style={styles.cancelText}>取消任务</Text>
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        style={styles.stream}
        contentContainerStyle={styles.streamContent}
        showsVerticalScrollIndicator={false}
      >
        {taskState.messages.map((message) => {
          if (message.kind === "user") {
            return (
              <MessageBubble key={message.id} role="user" text={message.text} />
            );
          }

          if (message.kind === "artifact") {
            return (
              <ArtifactMessageCard key={message.id} artifact={message.artifact} />
            );
          }

          return <AssistantMessageCard key={message.id} text={message.text} />;
        })}

        {selectedVersion ? (
          <View style={styles.versionPanel}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.versionRow}>
                {taskState.resultVersions.map((version) => (
                  <Pressable
                    key={version.id}
                    onPress={() => taskStore.selectResultVersion(version.versionNo)}
                    style={[
                      styles.versionButton,
                      version.versionNo === taskState.selectedVersionNo
                        ? styles.versionButtonActive
                        : null
                    ]}
                  >
                    <Text style={styles.versionText}>版本 {version.versionNo}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
            <ResultCard
              title={`结果版本 ${selectedVersion.versionNo}`}
              content={selectedVersion.outputText || "结构化结果已生成"}
            />
          </View>
        ) : null}
      </ScrollView>

      <View testID="conversation-composer-dock" style={styles.composerDock}>
        {taskState.pendingAttachments.length > 0 ? (
          <View style={styles.pendingList}>
            {taskState.pendingAttachments.map((attachment) => (
              <PendingFileCard
                key={attachment.clientId}
                attachment={attachment}
                onRemove={() => void removeAttachment(attachment.clientId, attachment.fileId)}
              />
            ))}
          </View>
        ) : null}

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

        <InputBar
          value={draft}
          onChangeText={setDraft}
          onSend={sendMessage}
          onAttach={() => {
            void attachFiles();
          }}
        />
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
  errorBanner: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3"
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#be123c",
    fontWeight: "600"
  },
  retryText: { marginTop: 6, color: "#9f1239", fontSize: 13, fontWeight: "800" },
  runningBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: tokens.colors.surface
  },
  runningText: { color: tokens.colors.textSecondary, fontSize: 13 },
  cancelText: { color: "#be123c", fontSize: 13, fontWeight: "800" },
  versionPanel: { gap: 8 },
  versionRow: { flexDirection: "row", gap: 8 },
  versionButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border
  },
  versionButtonActive: { borderColor: tokens.colors.text },
  versionText: { fontSize: 12, fontWeight: "700", color: tokens.colors.text },
  stream: {
    flex: 1
  },
  streamContent: {
    paddingTop: 4,
    paddingBottom: 6,
    gap: 12
  },
  composerDock: {
    gap: 6
  },
  pendingList: {
    gap: 8
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
