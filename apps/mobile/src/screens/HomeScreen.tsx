import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { InputBar } from "../components/InputBar";
import { taskStore } from "../store/taskStore";

export function HomeScreen() {
  const [text, setText] = useState(taskStore.getState().draft);

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>ClawWork</Text>
      <Text style={styles.title}>把任务交给我，我先帮你做一版</Text>
      <Text style={styles.description}>
        从总结文档、生成邮件到整理纪要，先把任务说清楚，结果会在对话流里继续完善。
      </Text>
      <InputBar
        value={text}
        onChangeText={(nextText) => {
          setText(nextText);
          taskStore.setDraft(nextText);
        }}
        onSend={() => {
          taskStore.submitDraft(text);
          setText("");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#f5f5f4"
  },
  eyebrow: {
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#0f766e",
    marginBottom: 12
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: "800",
    color: "#1c1917"
  },
  description: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#57534e"
  }
});
