import { render, screen } from "@testing-library/react-native";
import { HomeScreen } from "../screens/HomeScreen";
import { taskStore } from "../store/taskStore";

describe("HomeScreen", () => {
  it("renders Doubao-style entry content", () => {
    taskStore.reset();
    render(<HomeScreen />);

    expect(screen.getByText("今天想让我帮你做什么？")).toBeTruthy();
    expect(screen.getByText("总结文档")).toBeTruthy();
    expect(screen.getByText("会议纪要")).toBeTruthy();
    expect(screen.getByText("最近对话")).toBeTruthy();
    expect(screen.getByPlaceholderText("发送消息或按住说话…")).toBeTruthy();
  });
});
