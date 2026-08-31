import { StyleSheet, Text, View } from "react-native";
import { AssistantActionRow } from "./AssistantActionRow";
import { tokens } from "../theme/tokens";

export function AssistantMessageCard(props: { text: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.content}>{props.text}</Text>
      <View style={styles.divider} />
      <AssistantActionRow />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: tokens.radius.cardLg,
    padding: 18,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
    gap: 14
  },
  content: {
    fontSize: 18,
    lineHeight: 27,
    fontWeight: "800",
    color: tokens.colors.text
  },
  divider: {
    height: 1,
    backgroundColor: tokens.colors.border
  }
});
