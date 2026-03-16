import { Body, Controller, Get, Put } from "@nestjs/common";

type UserSettings = {
  preferredTone: string;
  preferredLength: string;
};

const defaultSettings: UserSettings = {
  preferredTone: "balanced",
  preferredLength: "standard"
};

@Controller("settings")
export class SettingsController {
  private settings: UserSettings = defaultSettings;

  @Get()
  getSettings() {
    return this.settings;
  }

  @Put()
  updateSettings(@Body() payload: Partial<UserSettings>) {
    this.settings = {
      ...this.settings,
      ...payload
    };

    return this.settings;
  }
}
