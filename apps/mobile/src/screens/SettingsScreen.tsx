import { StyleSheet, Text, View } from "react-native";
import { API_BASE_URL } from "../services/api/client";

export function SettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>设置</Text>
      <Text style={styles.item}>API: {API_BASE_URL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    backgroundColor: "#fafaf9"
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1c1917"
  },
  item: {
    fontSize: 15,
    lineHeight: 22,
    color: "#57534e"
  }
});
