import { SetMetadata } from '@nestjs/common';
import { Role } from './domain';

export const ROLES_KEY = 'roles';

/** Restringe un endpoint a uno o más roles. Uso: @Roles('ADMIN') */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
