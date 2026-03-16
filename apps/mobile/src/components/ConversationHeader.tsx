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
        <View style={styles.meta}>
          <Text numberOfLines={1} style={styles.title}>
            {props.title}
          </Text>
          <Text style={styles.subtitle}>{props.subtitle}</Text>
        </View>
      </View>
      <Pressable style={styles.moreButton}>
        <Text style={styles.moreText}>⋯</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  leftGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  backButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  backText: {
    fontSize: 28,
    lineHeight: 28,
    color: tokens.colors.text
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#f5ee85",
    alignItems: "center",
    justifyContent: "center"
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "800",
    color: tokens.colors.text
  },
  meta: {
    flex: 1
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: tokens.colors.text
  },
  subtitle: {
    marginTop: 1,
    fontSize: 11,
    color: tokens.colors.textMuted
  },
  moreButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  moreText: {
    fontSize: 22,
    lineHeight: 22,
    color: tokens.colors.text
  }
});
