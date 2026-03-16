import { Controller, Get, Inject } from "@nestjs/common";
import { TasksService } from "../tasks/tasks.service";

@Controller("history")
export class HistoryController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Get("tasks")
  listTasks() {
    return this.tasksService.listHistory();
  }
}
