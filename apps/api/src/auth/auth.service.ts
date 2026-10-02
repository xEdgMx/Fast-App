import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Roles, Role } from '../common/domain';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const role = dto.role ?? Roles.CLIENTE;

    // Usuario + wallet se crean juntos, de forma atómica.
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
          role,
          passwordHash,
        },
      });
      await tx.wallet.create({ data: { userId: created.id } });
      return created;
    });

    return this.issueToken(user.id, user.email, user.role as Role, user.name);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    return this.issueToken(user.id, user.email, user.role as Role, user.name);
  }

  private issueToken(id: string, email: string, role: Role, name: string) {
    const accessToken = this.jwt.sign({ sub: id, email, role });
    return {
      accessToken,
      user: { id, email, role, name },
    };
  }
}
