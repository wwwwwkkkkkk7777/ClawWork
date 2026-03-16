import { fireEvent, render, screen } from "@testing-library/react-native";
import { RootNavigator } from "../navigation/RootNavigator";
import { routeStore } from "../navigation/routeStore";
import { taskStore } from "../store/taskStore";

describe("mobile task flow", () => {
  it("starts from home and enters conversation after send", () => {
    routeStore.reset();
    taskStore.reset();
    render(<RootNavigator />);

    fireEvent.changeText(
      screen.getByPlaceholderText("发送消息或按住说话…"),
      "帮我整理会议纪要"
    );
    fireEvent.press(screen.getByLabelText("send message"));

    expect(screen.getAllByText("帮我整理会议纪要")).toHaveLength(2);
  });
});
