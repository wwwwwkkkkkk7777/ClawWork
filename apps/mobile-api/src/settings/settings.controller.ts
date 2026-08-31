import { Body, Controller, Get, Inject, Put } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { UpdateSettingsDto } from "./settings.dto";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(@Inject(SettingsService) private readonly settingsService: SettingsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.getSettings(user.id);
  }

  @Put()
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: UpdateSettingsDto
  ) {
    return this.settingsService.updateSettings(user.id, payload);
  }
}
