import { useSyncExternalStore } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { CapabilityCard } from "../components/CapabilityCard";
import { InputBar } from "../components/InputBar";
import { QuickChip } from "../components/QuickChip";
import { RecentConversationCard } from "../components/RecentConversationCard";
import { routeStore } from "../navigation/routeStore";
import { createTask } from "../services/tasks";
import { taskStore } from "../store/taskStore";
import { tokens } from "../theme/tokens";

const quickActions = ["总结文档", "周报生成", "写邮件"];

const capabilities = [
  {
    title: "会议纪要",
    description: "上传录音或文字，先整理重点和待办。",
    prompt: "帮我整理这次会议纪要",
    badge: "纪要"
  },
  {
    title: "拍题答疑",
    description: "拍照后直接提问，继续追问也更顺手。",
    prompt: "我想拍题答疑",
    badge: "题目"
  },
  {
    title: "流程草稿",
    description: "把零散想法变成清楚的 SOP 草案。",
    prompt: "帮我整理一个流程草稿",
    badge: "流程"
  },
  {
    title: "日报周报",
    description: "按更清楚的结构，先起一版工作总结。",
    prompt: "帮我写一份周报",
    badge: "汇报"
  }
];

export function HomeScreen() {
  const taskState = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot
  );

  const beginConversation = (prompt: string) => {
    const text = prompt.trim();
    if (!text) {
      return;
    }

    taskStore.startConversation(text);
    routeStore.navigate("conversation");

    void createTask({
      input: { text, fileIds: [] },
      preferredTone: "default",
      preferredLength: "medium"
    })
      .then((result) => {
        taskStore.setExecutionMeta(result);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "任务创建失败，请稍后重试";
        taskStore.setTaskError(message);
      });
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>ClawWork</Text>
            <Text style={styles.title}>今天想让我帮你做什么？</Text>
          </View>
          <View style={styles.topActions}>
            <Pressable
              accessibilityLabel="open history"
              onPress={() => routeStore.navigate("history")}
              style={styles.topActionButton}
            >
              <Text style={styles.topActionText}>历</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="open settings"
              onPress={() => routeStore.navigate("settings")}
              style={styles.topActionButton}
            >
              <Text style={styles.topActionText}>设</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.description}>
          总结文档、会议纪要、邮件草稿和工作汇报，都可以先交给我起一版。
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {quickActions.map((label) => (
            <QuickChip
              key={label}
              label={label}
              onPress={() => beginConversation(label)}
            />
          ))}
        </ScrollView>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>常用能力</Text>
          <View style={styles.capabilityGrid}>
            {capabilities.map((item) => (
              <CapabilityCard
                key={item.title}
                title={item.title}
                description={item.description}
                badge={item.badge}
                onPress={() => beginConversation(item.prompt)}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>最近对话</Text>
            <Pressable onPress={() => routeStore.navigate("history")}>
              <Text style={styles.viewAll}>查看全部</Text>
            </Pressable>
          </View>
          <View style={styles.recentList}>
            {taskState.recentConversations.slice(0, 3).map((item) => (
              <RecentConversationCard
                key={item.id}
                title={item.title}
                subtitle={item.subtitle}
                status={item.status}
                onPress={() => {
                  taskStore.resumeConversation(item);
                  routeStore.navigate("conversation");
                }}
              />
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.inputDock}>
        <InputBar
          value={taskState.draft}
          onChangeText={taskStore.setDraft}
          onSend={() => beginConversation(taskState.draft)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.canvas
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 24,
    paddingBottom: 180,
    gap: tokens.spacing.lg
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16
  },
  topActions: {
    flexDirection: "row",
    gap: 8
  },
  topActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  topActionText: {
    fontSize: 14,
    fontWeight: "800",
    color: tokens.colors.text
  },
  brand: {
    fontSize: 12,
    fontWeight: "700",
    color: tokens.colors.textMuted,
    marginBottom: 8
  },
  title: {
    fontSize: tokens.type.title,
    lineHeight: 38,
    fontWeight: "800",
    color: tokens.colors.text
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: tokens.colors.textSecondary
  },
  quickRow: {
    gap: 10,
    paddingVertical: 4
  },
  sectionCard: {
    borderRadius: tokens.radius.card,
    padding: 16,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    gap: 12
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: tokens.colors.textMuted
  },
  capabilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  viewAll: {
    fontSize: 13,
    fontWeight: "700",
    color: tokens.colors.accent
  },
  recentList: {
    gap: 10
  },
  inputDock: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 18
  }
});
