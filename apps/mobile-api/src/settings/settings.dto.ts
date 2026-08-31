import { IsIn, IsOptional } from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(["balanced", "formal", "concise", "friendly"])
  preferredTone?: string;

  @IsOptional()
  @IsIn(["short", "standard", "long"])
  preferredLength?: string;

  @IsOptional()
  @IsIn(["zh-CN", "en-US"])
  preferredLanguage?: string;
}
