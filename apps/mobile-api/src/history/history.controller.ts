import { Controller, Delete, Get, Inject, Param } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { ValidatedQuery } from "../request-validation";
import { TasksService } from "../tasks/tasks.service";
import { HistoryQueryDto } from "../tasks/tasks.dto";

@Controller("history")
export class HistoryController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Get("tasks")
  listTasks(
    @CurrentUser() user: AuthenticatedUser,
    @ValidatedQuery(HistoryQueryDto) query: HistoryQueryDto
  ) {
    return this.tasksService.listHistory(user.id, query);
  }

  @Get("tasks/:id")
  getTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.getHistoryTask(user.id, id);
  }

  @Delete("tasks/:id")
  deleteTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.deleteHistoryTask(user.id, id);
  }
}
