import { StyleSheet, Text, View } from "react-native";
import { tokens } from "../theme/tokens";

export function SettingsGroupCard(props: {
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.card}>
      {props.rows.map((row, index) => (
        <View
          key={row.label}
          style={[styles.row, index < props.rows.length - 1 ? styles.rowBorder : null]}
        >
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    backgroundColor: tokens.colors.surface,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: tokens.colors.text
  },
  value: {
    fontSize: 14,
    color: tokens.colors.textSecondary
  }
});
