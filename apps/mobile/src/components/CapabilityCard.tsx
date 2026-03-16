import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function CapabilityCard(props: {
  title: string;
  description: string;
  badge?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={props.onPress} style={styles.card}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{props.badge ?? "AI"}</Text>
      </View>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.description}>{props.description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: "48%",
    minHeight: 132,
    borderRadius: tokens.radius.card,
    padding: 16,
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: 10
  },
  badge: {
    alignSelf: "flex-start",
    minWidth: 34,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.round,
    backgroundColor: tokens.colors.accentSoft
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: tokens.colors.accent
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: tokens.colors.text
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.textSecondary
  }
});
