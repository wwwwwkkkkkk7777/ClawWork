import { render, screen } from "@testing-library/react-native";
import { HomeScreen } from "../screens/HomeScreen";

describe("HomeScreen", () => {
  it("renders the task-first prompt", () => {
    render(<HomeScreen />);

    expect(screen.getByText("把任务交给我，我先帮你做一版")).toBeTruthy();
  });
});
