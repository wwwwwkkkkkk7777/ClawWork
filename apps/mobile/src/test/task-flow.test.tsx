import { fireEvent, render, screen } from "@testing-library/react-native";
import { HomeScreen } from "../screens/HomeScreen";

describe("mobile task flow", () => {
  it("shows the task input and submit action", () => {
    render(<HomeScreen />);

    fireEvent.changeText(
      screen.getByPlaceholderText("告诉我你想交给我的任务"),
      "写一封客户跟进邮件"
    );

    expect(screen.getByText("发送")).toBeTruthy();
  });
});
