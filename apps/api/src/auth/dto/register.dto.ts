import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Roles, SELF_SIGNUP_ROLES, Role } from '../../common/domain';

export class RegisterDto {
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @IsString()
  @MinLength(2, { message: 'El nombre es muy corto' })
  name!: string;

  @IsString()
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // Solo CLIENTE o CONDUCTOR pueden auto-registrarse. ADMIN se crea aparte.
  @IsOptional()
  @IsIn(SELF_SIGNUP_ROLES, { message: 'Rol no permitido en el registro' })
  role?: Role = Roles.CLIENTE;
}
