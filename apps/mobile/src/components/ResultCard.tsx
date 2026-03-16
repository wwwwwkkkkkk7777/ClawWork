import { StyleSheet, Text, View } from "react-native";

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
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: "#e7e5e4"
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1c1917"
  },
  content: {
    fontSize: 15,
    lineHeight: 22,
    color: "#44403c"
  }
});
