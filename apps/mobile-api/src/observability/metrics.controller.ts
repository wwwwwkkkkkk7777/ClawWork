import type { IncomingMessage, ServerResponse } from "node:http";
import {
  Controller,
  Get,
  Inject,
  Res,
  Req,
  UnauthorizedException
} from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { ObservabilityService } from "./observability.service";

@Controller("metrics")
export class MetricsController {
  constructor(
    @Inject(ObservabilityService) private readonly observability: ObservabilityService
  ) {}

  @Public()
  @Get()
  async metrics(@Req() request: IncomingMessage, @Res() response: ServerResponse) {
    const token = process.env.METRICS_TOKEN?.trim();
    if (token && request.headers.authorization !== `Bearer ${token}`) {
      throw new UnauthorizedException("metrics token is invalid");
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", this.observability.registry.contentType);
    response.end(await this.observability.renderMetrics());
  }
}
