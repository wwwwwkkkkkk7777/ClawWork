import { authStore } from "../store/authStore";
import { apiRequest } from "./api/client";
import { unregisterPushToken } from "./push";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; nickname: string };
};

function saveSession(session: AuthResponse) {
  authStore.setSession({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.user.id,
    email: session.user.email,
    nickname: session.user.nickname
  });
  return session.user;
}

export async function login(input: { email: string; password: string }) {
  const session = await apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return saveSession(session);
}

export async function register(input: {
  email: string;
  password: string;
  nickname: string;
}) {
  const session = await apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return saveSession(session);
}

export async function logout() {
  const refreshToken = authStore.getState().refreshToken;
  try {
    await unregisterPushToken().catch(() => undefined);
    if (refreshToken) {
      await apiRequest<void>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken })
      });
    }
  } finally {
    authStore.clear();
  }
}
