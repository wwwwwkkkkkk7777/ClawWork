type AuthState = {
  accessToken: string | null;
  refreshToken: string | null;
  nickname: string | null;
};

const state: AuthState = {
  accessToken: null,
  refreshToken: null,
  nickname: null
};

export const authStore = {
  getState() {
    return state;
  },
  setSession(input: AuthState) {
    state.accessToken = input.accessToken;
    state.refreshToken = input.refreshToken;
    state.nickname = input.nickname;
  },
  clear() {
    state.accessToken = null;
    state.refreshToken = null;
    state.nickname = null;
  }
};
