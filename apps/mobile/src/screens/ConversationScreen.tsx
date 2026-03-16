import { useState, useSyncExternalStore } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { AssistantMessageCard } from "../components/AssistantMessageCard";
import { ConversationHeader } from "../components/ConversationHeader";
import { InputBar } from "../components/InputBar";
import { MessageBubble } from "../components/MessageBubble";
import { QuickChip } from "../components/QuickChip";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";
import { tokens } from "../theme/tokens";

const toolChips = ["快速", "总结文档", "拍题答疑"];

export function ConversationScreen() {
  const [draft, setDraft] = useState("");
  const taskState = useSyncExternalStore(
    taskStore.subscribe,
    taskStore.getSnapshot,
    taskStore.getSnapshot
  );

  const title =
    taskState.currentTitle && taskState.currentTitle !== "新对话"
      ? taskState.currentTitle
      : "新对话";

  return (
    <View style={styles.container}>
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

      <ScrollView
        horizontal
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
        onSend={() => {
          taskStore.appendFollowUp(draft);
          setDraft("");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 18,
    gap: 14,
    backgroundColor: tokens.colors.canvas
  },
  stream: {
    flex: 1
  },
  streamContent: {
    paddingTop: 8,
    paddingBottom: 8
  },
  toolRow: {
    gap: 10,
    paddingVertical: 4
  }
});
