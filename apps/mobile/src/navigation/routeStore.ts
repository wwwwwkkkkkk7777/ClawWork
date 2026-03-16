export type AppRoute = "home" | "conversation" | "history" | "settings";

type Listener = () => void;

const listeners = new Set<Listener>();

const state: { current: AppRoute } = {
  current: "home"
};

function emit() {
  listeners.forEach((listener) => listener());
}

export const routeStore = {
  getSnapshot() {
    return state.current;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  navigate(next: AppRoute) {
    state.current = next;
    emit();
  },
  reset() {
    state.current = "home";
    emit();
  }
};
