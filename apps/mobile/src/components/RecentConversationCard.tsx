import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function RecentConversationCard(props: {
  title: string;
  subtitle: string;
  status?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={props.onPress} style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{props.title}</Text>
        {props.status ? <Text style={styles.status}>{props.status}</Text> : null}
      </View>
      <Text style={styles.subtitle}>{props.subtitle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    gap: 6
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: tokens.colors.text
  },
  status: {
    fontSize: 12,
    fontWeight: "700",
    color: tokens.colors.accent
  },
  subtitle: {
    fontSize: 13,
    color: tokens.colors.textMuted
  }
});
