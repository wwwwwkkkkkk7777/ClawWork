import { StyleSheet, Text, View } from "react-native";
import { ResultCard } from "../components/ResultCard";

export function ConversationScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>执行中的任务</Text>
      <ResultCard
        title="流式草稿"
        content="这里会显示任务执行中的增量文本和下一步追问入口。"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    backgroundColor: "#fafaf9"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1c1917"
  }
});
