import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function MessageBubble(props: { role: "user" | "assistant"; text: string }) {
  const isUser = props.role === "user";

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.text, isUser ? styles.userText : styles.assistantText]}>
          {props.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    marginBottom: 12
  },
  rowUser: {
    alignItems: "flex-end"
  },
  rowAssistant: {
    alignItems: "flex-start"
  },
  bubble: {
    maxWidth: "78%",
    borderRadius: tokens.radius.bubble,
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  userBubble: {
    backgroundColor: tokens.colors.accent
  },
  assistantBubble: {
    backgroundColor: tokens.colors.surface
  },
  text: {
    fontSize: 18,
    lineHeight: 25
  },
  userText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  assistantText: {
    color: tokens.colors.text
  }
});
