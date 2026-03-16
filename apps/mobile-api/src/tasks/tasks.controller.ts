import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post()
  createTask(
    @Body()
    payload: {
      input: { text: string; fileIds: string[] };
      preferredTone: string;
      preferredLength: string;
    }
  ) {
    return this.tasksService.createTask(payload);
  }

  @Get(":id")
  getTask(@Param("id") id: string) {
    return this.tasksService.getTask(id);
  }
}
