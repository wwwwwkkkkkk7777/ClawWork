import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  nickname: string;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user;
  }
);
