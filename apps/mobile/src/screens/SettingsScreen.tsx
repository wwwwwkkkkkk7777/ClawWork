import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SettingsGroupCard } from "../components/SettingsGroupCard";
import { routeStore } from "../navigation/routeStore";
import { tokens } from "../theme/tokens";

const preferenceRows = [
  { label: "输出风格", value: "默认" },
  { label: "偏好语言", value: "简体中文" }
];

const systemRows = [
  { label: "模型网关", value: "已连接" },
  { label: "清理缓存", value: "进入" }
];

export function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => routeStore.navigate("home")} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>设置</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>账号</Text>
        <SettingsGroupCard
          rows={[
            { label: "账号", value: "ClawWork 用户" },
            { label: "通知", value: "已开启" }
          ]}
        />

        <Text style={styles.sectionLabel}>输出偏好</Text>
        <SettingsGroupCard rows={preferenceRows} />

        <Text style={styles.sectionLabel}>系统</Text>
        <SettingsGroupCard rows={systemRows} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: tokens.colors.canvas
  },
  header: {
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
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: tokens.colors.text
  },
  content: {
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: tokens.colors.textMuted,
    marginTop: 6
  }
});
