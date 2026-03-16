import { render, screen } from "@testing-library/react-native";
import { ConversationScreen } from "../screens/ConversationScreen";
import { taskStore } from "../store/taskStore";

describe("ConversationScreen", () => {
  it("renders Doubao-style conversation chrome", () => {
    taskStore.reset();
    taskStore.startConversation("你好");
    render(<ConversationScreen />);

    expect(screen.getByText("内容由 AI 生成")).toBeTruthy();
    expect(screen.getByText("快速")).toBeTruthy();
    expect(screen.getAllByText("你好")).toHaveLength(2);
  });
});
