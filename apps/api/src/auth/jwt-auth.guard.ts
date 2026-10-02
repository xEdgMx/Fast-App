import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Exige un JWT válido. Uso: @UseGuards(JwtAuthGuard) */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
