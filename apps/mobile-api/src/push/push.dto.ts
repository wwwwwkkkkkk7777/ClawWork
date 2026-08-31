import { IsIn, IsString, Length, Matches } from "class-validator";

export class RegisterPushTokenDto {
  @IsString()
  @Length(10, 512)
  @Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/)
  token!: string;

  @IsIn(["android", "ios"])
  platform!: string;
}

export class RemovePushTokenDto {
  @IsString()
  @Length(10, 512)
  token!: string;
}
