import { Body, Query, type Type, ValidationPipe } from "@nestjs/common";

export function createRequestValidationPipe(expectedType?: Type<unknown>) {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    ...(expectedType ? { expectedType } : {})
  });
}

export function ValidatedBody(expectedType: Type<unknown>): ParameterDecorator {
  return Body(createRequestValidationPipe(expectedType));
}

export function ValidatedQuery(expectedType: Type<unknown>): ParameterDecorator {
  return Query(createRequestValidationPipe(expectedType));
}
