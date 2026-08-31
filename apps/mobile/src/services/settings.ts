import { apiRequest } from "./api/client";

export type UserSettings = {
  preferredTone: "balanced" | "formal" | "concise" | "friendly";
  preferredLength: "short" | "standard" | "long";
  preferredLanguage: "zh-CN" | "en-US";
};

export function getSettings() {
  return apiRequest<UserSettings>("/settings");
}

export function updateSettings(input: Partial<UserSettings>) {
  return apiRequest<UserSettings>("/settings", {
    method: "PUT",
    body: JSON.stringify(input)
  });
}
