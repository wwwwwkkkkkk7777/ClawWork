type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  email: string | null;
  nickname: string | null;
  hydrated: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();

const state: AuthState = {
  accessToken: null,
  refreshToken: null,
  userId: null,
  email: null,
  nickname: null,
  hydrated: false
};

const SESSION_KEY = "clawwork.session.v1";

type StoredSession = Omit<AuthState, "hydrated">;

function secureStore() {
  try {
    return require("expo-secure-store") as {
      getItemAsync(key: string): Promise<string | null>;
      setItemAsync(key: string, value: string): Promise<void>;
      deleteItemAsync(key: string): Promise<void>;
    };
  } catch {
    return null;
  }
}

function persistSession() {
  const storage = secureStore();
  if (!storage) return;
  const value: StoredSession = {
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    userId: state.userId,
    email: state.email,
    nickname: state.nickname
  };
  void storage.setItemAsync(SESSION_KEY, JSON.stringify(value)).catch(() => undefined);
}

let snapshot = { ...state };

function emit() {
  snapshot = { ...state };
  listeners.forEach((listener) => listener());
}

export const authStore = {
  getState() {
    return state;
  },
  getSnapshot() {
    return snapshot;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  setSession(input: StoredSession) {
    state.accessToken = input.accessToken;
    state.refreshToken = input.refreshToken;
    state.userId = input.userId;
    state.email = input.email;
    state.nickname = input.nickname;
    state.hydrated = true;
    emit();
    persistSession();
  },
  clear() {
    state.accessToken = null;
    state.refreshToken = null;
    state.userId = null;
    state.email = null;
    state.nickname = null;
    state.hydrated = true;
    emit();
    void secureStore()?.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  },
  async hydrate() {
    if (state.hydrated) return;
    try {
      const raw = await secureStore()?.getItemAsync(SESSION_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredSession;
        state.accessToken = stored.accessToken;
        state.refreshToken = stored.refreshToken;
        state.userId = stored.userId;
        state.email = stored.email;
        state.nickname = stored.nickname;
      }
    } catch {
      // Corrupt or unavailable device storage is treated as a signed-out session.
    } finally {
      state.hydrated = true;
      emit();
    }
  }
};
