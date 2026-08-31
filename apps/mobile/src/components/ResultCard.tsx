import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function ResultCard(props: { title: string; content: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.content}>{props.content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.colors.surface,
    borderRadius: tokens.radius.card,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.colors.border
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: tokens.colors.text
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: tokens.colors.textSecondary
  }
});
