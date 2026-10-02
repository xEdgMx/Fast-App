import {
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/domain';

interface SocketUser {
  id: string;
  role: string;
  email: string;
}

/** Sala de difusión del feed para todos los conductores conectados. */
const DRIVERS_ROOM = 'drivers';
/** Sala por orden (cliente + conductor) para estados, chat y tracking. */
const orderRoom = (orderId: string) => `order:${orderId}`;
/** Sala personal de un usuario para notificaciones. */
const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Autentica el socket con el JWT del handshake. */
  handleConnection(client: Socket): void {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      const payload = this.jwt.verify(token, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'dev-secret',
      });
      const user: SocketUser = {
        id: payload.sub,
        role: payload.role,
        email: payload.email,
      };
      client.data.user = user;
      client.join(userRoom(user.id)); // notificaciones personales
      if (user.role === Roles.CONDUCTOR) {
        client.join(DRIVERS_ROOM);
      }
    } catch {
      client.disconnect();
    }
  }

  // ───────────── Mensajes entrantes del cliente ─────────────

  /** El cliente/conductor se suscribe a las novedades de una orden suya. */
  @SubscribeMessage('order:subscribe')
  async onSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() orderId: string,
  ): Promise<{ ok: boolean }> {
    const user = client.data.user as SocketUser;
    if (!user || !(await this.isParticipant(orderId, user))) {
      return { ok: false };
    }
    client.join(orderRoom(orderId));
    return { ok: true };
  }

  /** Chat de la orden (p. ej. acordar reemplazos). */
  @SubscribeMessage('chat')
  async onChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; text: string },
  ): Promise<void> {
    const user = client.data.user as SocketUser;
    const text = (body?.text ?? '').trim();
    if (!user || !text || !(await this.isParticipant(body.orderId, user))) {
      return;
    }
    const msg = await this.prisma.chatMessage.create({
      data: { orderId: body.orderId, fromUserId: user.id, text },
    });
    this.server
      .to(orderRoom(body.orderId))
      .emit('chat', { ...msg, fromRole: user.role });
  }

  /** El conductor asignado emite su ubicación. */
  @SubscribeMessage('tracking')
  async onTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; lat: number; lng: number },
  ): Promise<void> {
    const user = client.data.user as SocketUser;
    if (!user || user.role !== Roles.CONDUCTOR) return;
    const order = await this.prisma.order.findUnique({
      where: { id: body.orderId },
    });
    if (!order || order.conductorId !== user.id) return;

    const point = await this.prisma.trackingPoint.create({
      data: { orderId: body.orderId, lat: body.lat, lng: body.lng },
    });
    this.server.to(orderRoom(body.orderId)).emit('tracking', point);
  }

  // ───────────── Emisiones desde el backend (OrdersService) ─────────────

  /** Avisa a los conductores que el feed cambió (nueva orden, aceptada, etc.). */
  feedChanged(): void {
    this.server.to(DRIVERS_ROOM).emit('feed:refresh');
  }

  /** Notifica a los participantes de una orden que su estado cambió. */
  orderUpdated(order: { id: string }): void {
    this.server.to(orderRoom(order.id)).emit('order:update', order);
  }

  /** Envía una notificación personal a un usuario (campana/toast). */
  notifyUser(userId: string, text: string, kind = 'info'): void {
    this.server
      .to(userRoom(userId))
      .emit('notify', { text, kind, at: new Date().toISOString() });
  }

  private async isParticipant(
    orderId: string,
    user: SocketUser,
  ): Promise<boolean> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) return false;
    return (
      order.clienteId === user.id ||
      order.conductorId === user.id ||
      user.role === Roles.ADMIN
    );
  }
}
