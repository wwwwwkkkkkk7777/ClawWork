import { render, screen, within } from "@testing-library/react-native";
import { ConversationScreen } from "../screens/ConversationScreen";
import { taskStore } from "../store/taskStore";

describe("ConversationScreen", () => {
  it("keeps quick commands docked with the composer", () => {
    taskStore.reset();
    taskStore.startConversation("你好");
    render(<ConversationScreen />);

    expect(screen.getByText("内容由 AI 生成")).toBeTruthy();
    expect(screen.getAllByText("你好")).toHaveLength(2);

    const composerDock = screen.getByTestId("conversation-composer-dock");
    expect(within(composerDock).getByText("快速")).toBeTruthy();
    expect(within(composerDock).getByLabelText("send message")).toBeTruthy();
  });
});
