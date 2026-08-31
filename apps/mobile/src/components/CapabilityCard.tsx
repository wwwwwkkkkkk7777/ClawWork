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
    minHeight: 108,
    borderRadius: tokens.radius.card,
    padding: 14,
    backgroundColor: tokens.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    gap: 8
  },
  badge: {
    alignSelf: "flex-start",
    minWidth: 32,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: tokens.radius.round,
    backgroundColor: tokens.colors.accentSoft
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: tokens.colors.accent
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: tokens.colors.text
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
    color: tokens.colors.textSecondary
  }
});
