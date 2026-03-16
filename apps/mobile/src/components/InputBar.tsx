import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { tokens } from "../theme/tokens";

export function InputBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      <TextInput
        placeholder="发送消息或按住说话…"
        placeholderTextColor={tokens.colors.textMuted}
        value={props.value}
        onChangeText={props.onChangeText}
        style={styles.input}
      />
      <View style={styles.actions}>
        <Pressable accessibilityLabel="voice placeholder" style={styles.iconButton}>
          <Text style={styles.iconText}>◉</Text>
        </Pressable>
        <Pressable accessibilityLabel="more actions" style={styles.iconButton}>
          <Text style={styles.iconText}>＋</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="send message"
          onPress={props.onSend}
          style={styles.sendButton}
        >
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: tokens.radius.cardLg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  input: {
    minHeight: 52,
    fontSize: 18,
    color: tokens.colors.text
  },
  actions: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: tokens.colors.text,
    alignItems: "center",
    justifyContent: "center"
  },
  iconText: {
    fontSize: 18,
    color: tokens.colors.text
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: tokens.colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  sendText: {
    fontSize: 20,
    color: "#ffffff",
    fontWeight: "800"
  }
});
