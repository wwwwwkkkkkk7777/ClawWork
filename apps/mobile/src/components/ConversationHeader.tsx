import { Pressable, StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function ConversationHeader(props: {
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.leftGroup}>
        <Pressable
          accessibilityLabel="back to home"
          onPress={props.onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>AI</Text>
        </View>
        <View>
          <Text style={styles.title}>{props.title}</Text>
          <Text style={styles.subtitle}>{props.subtitle}</Text>
        </View>
      </View>
      <View style={styles.moreButton}>
        <Text style={styles.moreText}>⋯</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12
  },
  leftGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  backText: {
    fontSize: 34,
    lineHeight: 34,
    color: tokens.colors.text
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f5ee85",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: tokens.colors.text
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: tokens.colors.text
  },
  subtitle: {
    marginTop: 2,
    fontSize: 13,
    color: tokens.colors.textMuted
  },
  moreButton: {
    width: 36,
    alignItems: "center"
  },
  moreText: {
    fontSize: 24,
    color: tokens.colors.text
  }
});
