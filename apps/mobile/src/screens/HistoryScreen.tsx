import { useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RecentConversationCard } from "../components/RecentConversationCard";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";
import { tokens } from "../theme/tokens";

export function HistoryScreen() {
  const taskState = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => routeStore.navigate("home")} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>历史记录</Text>
      </View>
      <Text style={styles.subtitle}>最近的任务和对话会整理在这里，方便你继续处理。</Text>
      <ScrollView
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {taskState.recentConversations.map((item) => (
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
  }
});
