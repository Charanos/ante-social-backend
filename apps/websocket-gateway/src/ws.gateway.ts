import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket, 
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsAuthGuard } from './ws.auth.guard';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

const WS_ALLOWED_ORIGINS = (process.env.WS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: WS_ALLOWED_ORIGINS,
    credentials: true,
  },
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private readonly logger = new Logger(WsGateway.name);

  constructor(private readonly configService: ConfigService) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected unauthenticated socket: ${client.id}`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = jwt.verify(
        token,
        this.configService.get<string>('JWT_SECRET', ''),
      ) as { sub?: string; userId?: string };
      const userId = payload.sub || payload.userId;
      if (!userId) {
        throw new Error('Missing user identifier in token');
      }

      (client as any).user = payload;
      client.join(`user:${userId}`);
      this.logger.log(`Client connected: ${client.id} (user:${userId})`);
      return;
    } catch {
      this.logger.warn(`Rejected socket with invalid token: ${client.id}`);
      client.disconnect(true);
      return;
    }

  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.room);
    this.logger.log(`Client ${client.id} joined room ${data.room}`);
    return { event: 'joined_room', data: data.room };
  }

  @UseGuards(WsAuthGuard)
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @MessageBody() data: { room: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(data.room);
    this.logger.log(`Client ${client.id} left room ${data.room}`);
    return { event: 'left_room', data: data.room };
  }

  // Method called by Kafka Consumer to broadcast events
  broadcastToRoom(room: string, event: string, payload: any) {
    this.server.to(room).emit(event, payload);
    this.logger.debug(`Broadcast to ${room}: ${event}`);
  }

  broadcastToUser(userId: string, event: string, payload: any) {
    // Requires mapping userId -> socketId, or using room='user:userId'
    // We'll use the room approach as it handles multi-device support automatically
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  private extractToken(client: Socket): string | undefined {
    const authHeader = client.handshake.headers.authorization;
    const authToken = client.handshake.auth?.token;

    if (authToken && typeof authToken === 'string') {
      return authToken;
    }

    const [type, token] = authHeader?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
