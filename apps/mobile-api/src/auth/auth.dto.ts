import { IsEmail, IsOptional, IsString, Length } from "class-validator";

export class RegisterDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(12, 128)
  password!: string;

  @IsString()
  @Length(1, 80)
  nickname!: string;
}

export class LoginDto {
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}

export class DevLoginDto {
  @IsString()
  @Length(1, 80)
  nickname!: string;

  @IsOptional()
  @IsEmail()
  @Length(3, 254)
  email?: string;
}

export class RefreshTokenDto {
  @IsString()
  @Length(20, 4096)
  refreshToken!: string;
}
