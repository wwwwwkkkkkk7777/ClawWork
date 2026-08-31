import { IsInt, IsString, IsUUID, Length, Max, Min } from "class-validator";

export const ABSOLUTE_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export class CreateUploadDto {
  @IsString()
  @Length(1, 255)
  filename!: string;

  @IsString()
  @Length(3, 160)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(ABSOLUTE_MAX_UPLOAD_BYTES)
  sizeBytes!: number;
}

export class CompleteUploadDto {
  @IsUUID("4")
  fileId!: string;

  @IsString()
  @Length(1, 255)
  filename!: string;

  @IsString()
  @Length(3, 160)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(ABSOLUTE_MAX_UPLOAD_BYTES)
  sizeBytes!: number;

  @IsString()
  @Length(1, 512)
  storageKey!: string;
}
