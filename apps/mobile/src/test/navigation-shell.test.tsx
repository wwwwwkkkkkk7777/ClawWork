import { act, render, screen } from "@testing-library/react-native";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";

describe("RootNavigator", () => {
  it("renders home by default and can switch to history and settings", () => {
    routeStore.reset();
    taskStore.reset();
    render(<RootNavigator />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();

    act(() => routeStore.navigate("history"));
    expect(screen.getByText("历史记录")).toBeTruthy();

    act(() => routeStore.navigate("settings"));
    expect(screen.getByText("设置")).toBeTruthy();
  });
});
