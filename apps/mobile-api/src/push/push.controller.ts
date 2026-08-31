import { Controller, Delete, Inject, Post } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { ValidatedBody } from "../request-validation";
import { RegisterPushTokenDto, RemovePushTokenDto } from "./push.dto";
import { PushService } from "./push.service";

@Controller("push/tokens")
export class PushController {
  constructor(@Inject(PushService) private readonly push: PushService) {}

  @Post()
  register(
    @CurrentUser() user: AuthenticatedUser,
    @ValidatedBody(RegisterPushTokenDto) payload: RegisterPushTokenDto
  ) {
    return this.push.register(user.id, payload.token, payload.platform);
  }

  @Delete()
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @ValidatedBody(RemovePushTokenDto) payload: RemovePushTokenDto
  ) {
    await this.push.remove(user.id, payload.token);
    return { removed: true };
  }
}
