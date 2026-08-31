import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { login, register } from "../services/auth";
import { tokens } from "../theme/tokens";

export function LoginScreen() {
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("请输入邮箱和密码");
      return;
    }
    if (mode === "register" && !nickname.trim()) {
      setError("注册时需要填写昵称");
      return;
    }
    if (mode === "register" && password.length < 12) {
      setError("密码至少需要 12 个字符");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await login({ email: email.trim(), password });
      } else {
        await register({ email: email.trim(), password, nickname: nickname.trim() });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>ClawWork</Text>
        <Text style={styles.title}>登录后继续工作</Text>
        <Text style={styles.subtitle}>任务、文件和结果会安全地归属到你的账号。</Text>
        {mode === "register" ? (
          <TextInput
            accessibilityLabel="nickname"
            style={styles.input}
            placeholder="昵称"
            value={nickname}
            onChangeText={setNickname}
          />
        ) : null}
        <TextInput
          accessibilityLabel="email"
          style={styles.input}
          placeholder="邮箱"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          accessibilityLabel="password"
          style={styles.input}
          placeholder={mode === "register" ? "密码（至少 12 个字符）" : "密码"}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={loading}
          onPress={() => void submit()}
          style={styles.button}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{mode === "login" ? "登录" : "注册并登录"}</Text>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setMode((current) => (current === "login" ? "register" : "login"));
            setError(null);
          }}
        >
          <Text style={styles.switchText}>
            {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: tokens.colors.canvas
  },
  card: {
    padding: 24,
    borderRadius: 24,
    gap: 14,
    backgroundColor: tokens.colors.surface,
    borderWidth: 1,
    borderColor: tokens.colors.border
  },
  brand: { fontSize: 13, fontWeight: "800", color: tokens.colors.textMuted },
  title: { fontSize: 26, fontWeight: "800", color: tokens.colors.text },
  subtitle: { fontSize: 14, lineHeight: 21, color: tokens.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: tokens.colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: tokens.colors.text,
    backgroundColor: tokens.colors.canvas
  },
  error: { color: "#be123c", fontSize: 13 },
  button: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: tokens.colors.text
  },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  switchText: { color: tokens.colors.textSecondary, fontSize: 14, textAlign: "center" }
});
