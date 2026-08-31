import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RecentConversationCard } from "../components/RecentConversationCard";
import { routeStore } from "../navigation/routeStore";
import { deleteHistoryTask, getHistoryTask, listHistory } from "../services/tasks";
import { taskStore } from "../store/taskStore";
import { tokens } from "../theme/tokens";

export function HistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const taskState = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot
  );

  useEffect(() => {
    let active = true;
    void listHistory()
      .then((response) => {
        if (!active) return;
        const page = Array.isArray(response)
          ? { items: response, nextCursor: null }
          : response;
        taskStore.hydrateRecentConversations(
          page.items.map((item) => ({
            id: item.taskId,
            sessionId: item.sessionId,
            title: item.title,
            subtitle: new Date(item.updatedAt).toLocaleString(),
            status:
              item.status === "completed"
                ? "已完成"
                : item.status === "failed"
                  ? "失败"
                  : item.status === "cancelled"
                    ? "已取消"
                    : "处理中",
            prompt: item.prompt
          }))
        );
        setNextCursor(page.nextCursor);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "历史加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openConversation = async (taskId: string) => {
    setError(null);
    try {
      const detail = await getHistoryTask(taskId);
      taskStore.hydrateServerConversation(detail);
      routeStore.navigate("conversation");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "历史详情加载失败");
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await listHistory(nextCursor);
      taskStore.appendRecentConversations(
        page.items.map((item) => ({
          id: item.taskId,
          sessionId: item.sessionId,
          title: item.title,
          subtitle: new Date(item.updatedAt).toLocaleString(),
          status:
            item.status === "completed"
              ? "已完成"
              : item.status === "failed"
                ? "失败"
                : item.status === "cancelled"
                  ? "已取消"
                  : "处理中",
          prompt: item.prompt
        }))
      );
      setNextCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "更多历史加载失败");
    } finally {
      setLoadingMore(false);
    }
  };

  const removeConversation = async (taskId: string) => {
    setError(null);
    try {
      await deleteHistoryTask(taskId);
      taskStore.removeRecentConversation(taskId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "历史删除失败");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => routeStore.navigate("home")} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>历史记录</Text>
      </View>
      <Text style={styles.subtitle}>最近的任务和对话会整理在这里，方便你继续处理。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {!loading && taskState.recentConversations.length === 0 ? (
          <Text style={styles.empty}>还没有历史任务</Text>
        ) : null}
        {taskState.recentConversations.map((item) => (
          <RecentConversationCard
            key={item.id}
            title={item.title}
            subtitle={item.subtitle}
            status={item.status}
            onPress={() => void openConversation(item.id)}
            onDelete={() => void removeConversation(item.id)}
          />
        ))}
        {nextCursor ? (
          <Pressable onPress={() => void loadMore()} style={styles.moreButton}>
            <Text style={styles.moreText}>{loadingMore ? "加载中…" : "加载更多"}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    backgroundColor: tokens.colors.canvas
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  backText: {
    fontSize: 34,
    lineHeight: 34,
    color: tokens.colors.text
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: tokens.colors.text
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 23,
    color: tokens.colors.textSecondary
  },
  list: {
    marginTop: 18,
    gap: 12,
    paddingBottom: 24
  },
  empty: { paddingVertical: 28, textAlign: "center", color: tokens.colors.textMuted },
  error: { marginTop: 10, color: "#be123c", fontSize: 13 },
  moreButton: { alignItems: "center", paddingVertical: 14 },
  moreText: { color: tokens.colors.accent, fontWeight: "700" }
});
