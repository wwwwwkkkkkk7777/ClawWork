import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SettingsGroupCard } from "../components/SettingsGroupCard";
import { routeStore } from "../navigation/routeStore";
import { logout } from "../services/auth";
import {
  getSettings,
  updateSettings,
  type UserSettings
} from "../services/settings";
import { authStore } from "../store/authStore";
import { tokens } from "../theme/tokens";

const systemRows = [
  { label: "模型网关", value: "已连接" },
  { label: "清理缓存", value: "进入" }
];

export function SettingsScreen() {
  const auth = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot
  );
  const [settings, setSettings] = useState<UserSettings>({
    preferredTone: "balanced",
    preferredLength: "standard",
    preferredLanguage: "zh-CN"
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getSettings()
      .then((value) => {
        if (active) setSettings(value);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "设置加载失败");
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (patch: Partial<UserSettings>) => {
    setError(null);
    try {
      setSettings(await updateSettings(patch));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "设置保存失败");
    }
  };

  const toneLabels = { balanced: "均衡", formal: "正式", concise: "简洁", friendly: "友好" };
  const lengthLabels = { short: "简短", standard: "标准", long: "详细" };
  const nextTone: Record<UserSettings["preferredTone"], UserSettings["preferredTone"]> = {
    balanced: "formal",
    formal: "concise",
    concise: "friendly",
    friendly: "balanced"
  };
  const nextLength: Record<UserSettings["preferredLength"], UserSettings["preferredLength"]> = {
    short: "standard",
    standard: "long",
    long: "short"
  };
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
            { label: "账号", value: auth.nickname ?? "ClawWork 用户" },
            { label: "退出登录", value: "退出", onPress: () => void logout() }
          ]}
        />

        <Text style={styles.sectionLabel}>输出偏好</Text>
        <SettingsGroupCard
          rows={[
            {
              label: "输出风格",
              value: toneLabels[settings.preferredTone],
              onPress: () => void save({ preferredTone: nextTone[settings.preferredTone] })
            },
            {
              label: "输出长度",
              value: lengthLabels[settings.preferredLength],
              onPress: () => void save({ preferredLength: nextLength[settings.preferredLength] })
            },
            {
              label: "偏好语言",
              value: settings.preferredLanguage === "zh-CN" ? "简体中文" : "English",
              onPress: () =>
                void save({
                  preferredLanguage:
                    settings.preferredLanguage === "zh-CN" ? "en-US" : "zh-CN"
                })
            }
          ]}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
  },
  error: { color: "#be123c", fontSize: 13 }
});
