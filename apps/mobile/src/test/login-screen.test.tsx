import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { LoginScreen } from "../screens/LoginScreen";
import { login, register } from "../services/auth";

jest.mock("../services/auth", () => ({
  login: jest.fn().mockResolvedValue({ id: "user-1" }),
  register: jest.fn().mockResolvedValue({ id: "user-1" })
}));

describe("LoginScreen", () => {
  it("submits email/password login", async () => {
    render(<LoginScreen />);
    fireEvent.changeText(screen.getByLabelText("email"), "user@example.com");
    fireEvent.changeText(screen.getByLabelText("password"), "correct password");
    fireEvent.press(screen.getByRole("button", { name: "登录" }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "correct password"
      })
    );
  });

  it("switches to registration and enforces the production password length", async () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByText("没有账号？注册"));
    fireEvent.changeText(screen.getByLabelText("nickname"), "User");
    fireEvent.changeText(screen.getByLabelText("email"), "new@example.com");
    fireEvent.changeText(screen.getByLabelText("password"), "a secure password");
    fireEvent.press(screen.getByRole("button", { name: "注册并登录" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        nickname: "User",
        email: "new@example.com",
        password: "a secure password"
      })
    );
  });
});
