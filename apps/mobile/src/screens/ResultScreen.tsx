import { StyleSheet, Text, View } from "react-native";
import { ResultCard } from "../components/ResultCard";

export function ResultScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>最终结果</Text>
      <ResultCard
        title="文档总结"
        content="这里展示结构化结果卡片，用于长结果、版本切换和复制导出。"
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
