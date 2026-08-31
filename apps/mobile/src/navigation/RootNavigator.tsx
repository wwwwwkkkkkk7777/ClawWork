import { useEffect, useSyncExternalStore } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { ConversationScreen } from "../screens/ConversationScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { LoginScreen } from "../screens/LoginScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { authStore } from "../store/authStore";
import { taskStore } from "../store/taskStore";
import { configurePushNotifications } from "../services/push";
import { getHistoryTask, listActiveTasks } from "../services/tasks";
import { routeStore } from "./routeStore";

export function RootNavigator() {
  const auth = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getSnapshot
  );
  const route = useSyncExternalStore(
    routeStore.subscribe,
    routeStore.getSnapshot,
    routeStore.getSnapshot
  );

  useEffect(() => {
    void authStore.hydrate();
  }, []);

  useEffect(() => {
    if (!auth.accessToken) {
      taskStore.reset();
      routeStore.reset();
    }
  }, [auth.accessToken]);

  useEffect(() => {
    if (!auth.accessToken) return;
    let active = true;
    let removePushListener: () => void = () => undefined;

    const openTask = async (taskId: string) => {
      try {
        const detail = await getHistoryTask(taskId);
        if (!active) return;
        taskStore.hydrateServerConversation(detail);
        routeStore.navigate("conversation");
      } catch {
        // The active-task recovery below handles a notification arriving before history commits.
      }
    };

    const recoverActiveTask = async () => {
      if (typeof listActiveTasks !== "function") return;
      try {
        const tasks = await listActiveTasks();
        if (!active) return;
        if (tasks.length > 0) {
          taskStore.recoverActiveTask(tasks[0]);
          routeStore.navigate("conversation");
          return;
        }
        const previousTaskId = taskStore.getSnapshot().currentTaskId;
        if (previousTaskId) {
          const detail = await getHistoryTask(previousTaskId);
          if (!active) return;
          taskStore.hydrateServerConversation(detail);
          routeStore.navigate("conversation");
        }
      } catch {
        // Network recovery is retried the next time the app returns to the foreground.
      }
    };

    void recoverActiveTask();
    void configurePushNotifications((taskId) => void openTask(taskId))
      .then((remove) => {
        if (active) removePushListener = remove;
        else remove();
      })
      .catch(() => undefined);
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void recoverActiveTask();
    });
    return () => {
      active = false;
      removePushListener();
      appStateSubscription.remove();
    };
  }, [auth.accessToken]);

  if (!auth.hydrated) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!auth.accessToken) return <LoginScreen />;

  if (route === "conversation") {
    return <ConversationScreen />;
  }

  if (route === "history") {
    return <HistoryScreen />;
  }

  if (route === "settings") {
    return <SettingsScreen />;
  }

  return <HomeScreen />;
}
