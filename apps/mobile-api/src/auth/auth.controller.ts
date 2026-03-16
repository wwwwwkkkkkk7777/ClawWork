import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { issueTokens, parseDevLoginPayload } from "@clawwork/auth";

@Controller("auth")
export class AuthController {
  @Post("dev-login")
  @HttpCode(200)
  async devLogin(@Body() payload: unknown) {
    const user = parseDevLoginPayload(payload);
    const tokens = await issueTokens({
      sub: user.email ?? user.nickname,
      email: user.email
    });

    return {
      ...tokens,
      user
    };
  }
}
