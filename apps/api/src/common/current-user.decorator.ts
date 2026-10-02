import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from './domain';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

/** Inyecta el usuario autenticado (del JWT). Uso: @CurrentUser() user: AuthUser */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthUser;
  },
);
