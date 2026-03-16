import { Body, Controller, Inject, Post } from "@nestjs/common";
import { TasksService } from "../tasks/tasks.service";

@Controller("files")
export class FilesController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post("upload-url")
  createUploadUrl(@Body() payload: { filename: string }) {
    return this.tasksService.createUploadUrl(payload.filename);
  }

  @Post("complete")
  completeUpload(@Body() payload: { fileId: string; filename: string }) {
    return this.tasksService.completeUpload(payload.fileId, payload.filename);
  }
}
