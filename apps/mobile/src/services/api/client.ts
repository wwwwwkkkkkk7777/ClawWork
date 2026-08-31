import { NativeModules } from "react-native";
import { authStore } from "../../store/authStore";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";
const DEFAULT_API_PORT = "3001";

type ExpoNativeConstants = {
  expoConfig?: {
    hostUri?: string | null;
  } | null;
  manifest2?: {
    extra?: {
      expoClient?: {
        hostUri?: string | null;
      } | null;
    } | null;
  } | null;
  manifest?: {
    debuggerHost?: string | null;
  } | null;
  platform?: {
    hostUri?: string | null;
  } | null;
  experienceUrl?: string | null;
  linkingUri?: string | null;
};

function loadExpoConstants(): ExpoNativeConstants {
  try {
    const expoConstantsModule = require("expo-constants");
    return (expoConstantsModule?.default ?? expoConstantsModule ?? {}) as ExpoNativeConstants;
  } catch {
    return {};
  }
}

export function resolveExpoHostLocator(constants: ExpoNativeConstants) {
  return (
    constants.expoConfig?.hostUri ??
    constants.manifest2?.extra?.expoClient?.hostUri ??
    constants.platform?.hostUri ??
    constants.experienceUrl ??
    constants.linkingUri ??
    constants.manifest?.debuggerHost
  );
}

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

function deriveApiBaseUrlFromLocator(locator?: string | null): string | undefined {
  if (!locator) {
    return undefined;
  }

  const normalizedLocator = locator.includes("://") ? locator : `http://${locator}`;

  try {
    const sourceUrl = new URL(normalizedLocator);
    if (!sourceUrl.hostname || sourceUrl.hostname === "localhost") {
      return undefined;
    }

    const normalizedProtocol =
      sourceUrl.protocol === "https:" || sourceUrl.protocol === "exps:"
        ? "https:"
        : "http:";

    return `${normalizedProtocol}//${sourceUrl.hostname}:${DEFAULT_API_PORT}`;
  } catch {
    return undefined;
  }
}

export function resolveApiBaseUrl(explicitBaseUrl?: string, scriptUrl?: string): string {
  return explicitBaseUrl ?? deriveApiBaseUrlFromScriptUrl(scriptUrl) ?? DEFAULT_API_BASE_URL;
}

function unique(values: Array<string | undefined>) {
  return values.filter(
    (value, index, array): value is string =>
      typeof value === "string" && value.length > 0 && array.indexOf(value) === index
  );
}

export function buildApiBaseUrlCandidates(
  explicitBaseUrl?: string,
  scriptUrl?: string,
  hostUri?: string | null
) {
  return unique([
    explicitBaseUrl,
    deriveApiBaseUrlFromLocator(hostUri),
    deriveApiBaseUrlFromScriptUrl(scriptUrl),
    DEFAULT_API_BASE_URL
  ]);
}

const expoConstants = loadExpoConstants();
const API_BASE_URL_CANDIDATES = buildApiBaseUrlCandidates(
  process.env.EXPO_PUBLIC_API_BASE_URL,
  NativeModules.SourceCode?.scriptURL,
  resolveExpoHostLocator(expoConstants)
);
const API_BASE_URL = API_BASE_URL_CANDIDATES[0] ?? DEFAULT_API_BASE_URL;

function shouldRetryWithNextBaseUrl(error: unknown) {
  return error instanceof Error && /network request failed|fetch failed/i.test(error.message);
}

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; nickname: string };
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(baseUrl: string) {
  const refreshToken = authStore.getState().refreshToken;
  if (!refreshToken) return false;

  if (!refreshPromise) {
    refreshPromise = fetch(`${baseUrl}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken })
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const session = (await response.json()) as AuthResponse;
        authStore.setSession({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          userId: session.user.id,
          email: session.user.email,
          nickname: session.user.nickname
        });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  const refreshed = await refreshPromise;
  if (!refreshed) authStore.clear();
  return refreshed;
}

async function parseError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | null;
  const message = Array.isArray(payload?.message)
    ? payload.message.join("; ")
    : payload?.message;
  return new Error(message || `request failed: ${response.status}`);
}

async function requestAtBaseUrl<T>(
  baseUrl: string,
  path: string,
  init: RequestInit | undefined,
  allowRefresh: boolean
): Promise<T> {
  const accessToken = authStore.getState().accessToken;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (response.status === 401 && allowRefresh && (await refreshSession(baseUrl))) {
    return requestAtBaseUrl<T>(baseUrl, path, init, false);
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequestWithBaseUrls<T>(
  baseUrls: string[],
  path: string,
  init?: RequestInit
): Promise<T> {
  let lastError: unknown;

  for (const [index, baseUrl] of baseUrls.entries()) {
    try {
      return await requestAtBaseUrl<T>(baseUrl, path, init, true);
    } catch (error) {
      lastError = error;
      if (index < baseUrls.length - 1 && shouldRetryWithNextBaseUrl(error)) {
        continue;
      }

      if (
        shouldRetryWithNextBaseUrl(error) ||
        (error instanceof Error && /network request failed|fetch failed/i.test(error.message))
      ) {
        throw new Error(`Network request failed (tried: ${baseUrls.join(", ")})`);
      }

      throw error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("request failed");
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return apiRequestWithBaseUrls<T>(API_BASE_URL_CANDIDATES, path, init);
}

export { API_BASE_URL };
