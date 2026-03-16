import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { TasksService } from "./tasks.service";

type TaskPayload = {
  input: { text: string; fileIds: string[] };
  preferredTone: string;
  preferredLength: string;
};

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post()
  createTask(@Body() payload: TaskPayload) {
    return this.tasksService.createTask(payload);
  }

  @Post(":id/followup")
  createFollowUp(@Param("id") id: string, @Body() payload: TaskPayload) {
    return this.tasksService.createFollowUp(id, payload);
  }

  @Get(":id")
  getTask(@Param("id") id: string) {
    return this.tasksService.getTask(id);
  }
}
