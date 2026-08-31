import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { tokens } from "../theme/tokens";

export function InputBar(props: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  attachDisabled?: boolean;
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
          <Text style={styles.iconText}>◎</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="attach file"
          disabled={props.attachDisabled}
          onPress={props.onAttach}
          style={styles.iconButton}
        >
          <Text style={styles.iconText}>+</Text>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: tokens.radius.cardLg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  input: {
    flex: 1,
    minHeight: 24,
    fontSize: 16,
    color: tokens.colors.text
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: tokens.colors.text,
    alignItems: "center",
    justifyContent: "center"
  },
  iconText: {
    fontSize: 15,
    color: tokens.colors.text
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.colors.accent,
    alignItems: "center",
    justifyContent: "center"
  },
  sendText: {
    fontSize: 17,
    color: "#ffffff",
    fontWeight: "800"
  }
});
