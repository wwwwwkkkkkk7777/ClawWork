import { NativeModules } from "react-native";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_API_PORT = "3001";

function deriveApiBaseUrlFromScriptUrl(scriptUrl?: string): string | undefined {
  if (!scriptUrl) {
    return undefined;
  }

  try {
    const bundleUrl = new URL(scriptUrl);

    if (bundleUrl.protocol !== "http:" && bundleUrl.protocol !== "https:") {
      return undefined;
    }

    if (!bundleUrl.hostname || bundleUrl.hostname === "localhost") {
      return undefined;
    }

    return `${bundleUrl.protocol}//${bundleUrl.hostname}:${DEFAULT_API_PORT}`;
  } catch {
    return undefined;
  }
}

export function resolveApiBaseUrl(explicitBaseUrl?: string, scriptUrl?: string): string {
  return explicitBaseUrl ?? deriveApiBaseUrlFromScriptUrl(scriptUrl) ?? DEFAULT_API_BASE_URL;
}

const API_BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  NativeModules.SourceCode?.scriptURL
);

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export { API_BASE_URL };
