import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentUser, type AuthenticatedUser } from "./current-user.decorator";
import { DevLoginDto, LoginDto, RefreshTokenDto, RegisterDto } from "./auth.dto";
import { Public } from "./public.decorator";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post("register")
  register(@Body() payload: RegisterDto) {
    return this.authService.register(payload);
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() payload: LoginDto) {
    return this.authService.login(payload);
  }

  @Public()
  @Post("dev-login")
  @HttpCode(200)
  devLogin(@Body() payload: DevLoginDto) {
    return this.authService.devLogin(payload);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  refresh(@Body() payload: RefreshTokenDto) {
    return this.authService.refresh(payload.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: RefreshTokenDto
  ) {
    await this.authService.logout(user.id, payload.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

@Controller()
export class MeController {
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}
