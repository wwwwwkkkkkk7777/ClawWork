import { useSyncExternalStore } from "react";
import { ConversationScreen } from "../screens/ConversationScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { routeStore } from "./routeStore";

export function RootNavigator() {
  const route = useSyncExternalStore(
    routeStore.subscribe,
    routeStore.getSnapshot,
    routeStore.getSnapshot
  );

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
