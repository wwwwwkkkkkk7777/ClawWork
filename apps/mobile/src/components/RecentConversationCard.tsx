import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function RecentConversationCard(props: {
  title: string;
  subtitle: string;
  status?: string;
  onPress?: () => void;
  onDelete?: () => void;
}) {
  return (
    <View style={styles.card}>
      <Pressable onPress={props.onPress} style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{props.title}</Text>
          {props.status ? <Text style={styles.status}>{props.status}</Text> : null}
        </View>
        <Text style={styles.subtitle}>{props.subtitle}</Text>
      </Pressable>
      {props.onDelete ? (
        <Pressable accessibilityLabel={`delete ${props.title}`} onPress={props.onDelete}>
          <Text style={styles.deleteText}>删除</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    gap: 6
  },
  content: { gap: 6 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: tokens.colors.text
  },
  status: {
    fontSize: 11,
    fontWeight: "700",
    color: tokens.colors.accent
  },
  subtitle: {
    fontSize: 12,
    color: tokens.colors.textMuted
  },
  deleteText: { fontSize: 12, color: "#be123c", fontWeight: "700" }
});
