import { Platform } from "react-native";
import { apiRequest } from "./api/client";

let registeredToken: string | null = null;

type NotificationResponse = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

type Subscription = { remove(): void };

type NotificationsModule = {
  AndroidImportance: { DEFAULT: number };
  setNotificationHandler(handler: unknown): void;
  setNotificationChannelAsync(id: string, channel: unknown): Promise<unknown>;
  getPermissionsAsync(): Promise<{ status: string }>;
  requestPermissionsAsync(): Promise<{ status: string }>;
  getExpoPushTokenAsync(options: { projectId: string }): Promise<{ data: string }>;
  addNotificationResponseReceivedListener(
    listener: (response: NotificationResponse) => void
  ): Subscription;
  getLastNotificationResponseAsync(): Promise<NotificationResponse | null>;
};

function loadPushModules() {
  try {
    const Notifications = require("expo-notifications") as NotificationsModule;
    const Device = require("expo-device") as { isDevice?: boolean };
    const ConstantsModule = require("expo-constants") as {
      default?: {
        easConfig?: { projectId?: string } | null;
        expoConfig?: { extra?: { eas?: { projectId?: string } } } | null;
      };
    };
    const constants = (ConstantsModule.default ?? ConstantsModule) as {
      easConfig?: { projectId?: string } | null;
      expoConfig?: { extra?: { eas?: { projectId?: string } } } | null;
    };
    return {
      Notifications,
      Device,
      Constants: constants
    };
  } catch {
    return null;
  }
}

function taskIdFromResponse(response: NotificationResponse | null) {
  const value = response?.notification.request.content.data?.taskId;
  return typeof value === "string" && value ? value : null;
}

export async function configurePushNotifications(
  onTaskSelected: (taskId: string) => void
) {
  if (process.env.NODE_ENV === "test") return () => undefined;
  const modules = loadPushModules();
  if (!modules || Platform.OS === "web" || modules.Device.isDevice === false) {
    return () => undefined;
  }
  const { Notifications, Constants } = modules;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false
    })
  });
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("tasks", {
      name: "任务状态",
      importance: Notifications.AndroidImportance.DEFAULT
    });
  }

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const taskId = taskIdFromResponse(response);
      if (taskId) onTaskSelected(taskId);
    }
  );
  const lastTaskId = taskIdFromResponse(
    await Notifications.getLastNotificationResponseAsync()
  );
  if (lastTaskId) onTaskSelected(lastTaskId);

  const currentPermission = await Notifications.getPermissionsAsync();
  const permission =
    currentPermission.status === "granted"
      ? currentPermission
      : await Notifications.requestPermissionsAsync();
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (permission.status === "granted" && projectId) {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await apiRequest("/push/tokens", {
      method: "POST",
      body: JSON.stringify({ token, platform: Platform.OS })
    });
    registeredToken = token;
  }

  return () => responseSubscription.remove();
}

export async function unregisterPushToken() {
  if (!registeredToken) return;
  const token = registeredToken;
  await apiRequest("/push/tokens", {
    method: "DELETE",
    body: JSON.stringify({ token })
  });
  registeredToken = null;
}
