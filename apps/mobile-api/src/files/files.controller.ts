import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post
} from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { TasksService } from "../tasks/tasks.service";
import { CompleteUploadDto, CreateUploadDto } from "./files.dto";

@Controller("files")
export class FilesController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post("upload-url")
  createUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateUploadDto
  ) {
    return this.tasksService.createUploadUrl(user.id, payload);
  }

  @Post("complete")
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CompleteUploadDto
  ) {
    return this.tasksService.completeUpload(user.id, payload);
  }

  @Get(":fileId")
  getFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("fileId") fileId: string
  ) {
    return this.tasksService.getFile(user.id, fileId);
  }

  @Delete(":fileId")
  deleteFile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("fileId") fileId: string
  ) {
    return this.tasksService.deleteFile(user.id, fileId);
  }
}
