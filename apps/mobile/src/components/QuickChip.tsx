import { Pressable, StyleSheet, Text } from "react-native";
import { tokens } from "../theme/tokens";

export function QuickChip(props: { label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.chip}>
      <Text style={styles.label}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: tokens.radius.chip,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2
  },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: tokens.colors.text
  }
});
