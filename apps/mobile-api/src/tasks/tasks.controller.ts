import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { CreateTaskDto } from "./tasks.dto";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasksService: TasksService) {}

  @Post()
  createTask(
    @CurrentUser() user: AuthenticatedUser,
    @Body() payload: CreateTaskDto
  ) {
    return this.tasksService.createTask(user.id, payload);
  }

  @Post(":id/followup")
  createFollowUp(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() payload: CreateTaskDto
  ) {
    return this.tasksService.createFollowUp(user.id, id, payload);
  }

  @Post(":id/regenerate")
  regenerate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.regenerate(user.id, id);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.cancelTask(user.id, id);
  }

  @Get("active/current")
  listActive(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.listActiveTasks(user.id);
  }

  @Get(":id/versions")
  getVersions(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.getVersions(user.id, id);
  }

  @Get(":id")
  getTask(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.tasksService.getTask(user.id, id);
  }
}
