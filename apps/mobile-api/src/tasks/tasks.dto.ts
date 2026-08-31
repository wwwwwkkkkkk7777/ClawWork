import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

export class TaskInputDto {
  @IsString()
  @Length(1, 20_000)
  text!: string;

  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID("4", { each: true })
  fileIds!: string[];
}

export class HistoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;

  @IsOptional()
  @IsIn(["queued", "running", "completed", "failed", "cancelled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class CreateTaskDto {
  @ValidateNested()
  @Type(() => TaskInputDto)
  input!: TaskInputDto;

  @IsOptional()
  @IsIn(["default", "balanced", "formal", "concise", "friendly"])
  preferredTone?: string;

  @IsOptional()
  @IsIn(["short", "medium", "standard", "long"])
  preferredLength?: string;
}
