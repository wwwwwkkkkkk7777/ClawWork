import { StyleSheet, Text, View } from "react-native";

export function HistoryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>历史任务</Text>
      <Text style={styles.item}>这里会读取任务摘要列表，而不是原始 Gateway 流。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: "#fafaf9"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1c1917"
  },
  item: {
    fontSize: 15,
    lineHeight: 22,
    color: "#57534e"
  }
});
