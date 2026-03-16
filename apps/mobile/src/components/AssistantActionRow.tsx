import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

const actions = ["复制", "朗读", "收藏", "分享", "重试"];

export function AssistantActionRow() {
  return (
    <View style={styles.row}>
      {actions.map((label) => (
        <Pressable key={label} style={styles.action}>
          <Text style={styles.actionText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  action: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 11,
    backgroundColor: tokens.colors.accentSoft
  },
  actionText: {
    fontSize: 10,
    fontWeight: "700",
    color: tokens.colors.accent
  }
});
