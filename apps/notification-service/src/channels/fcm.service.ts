import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

type FirebaseAdmin = {
  apps: any[];
  app: () => any;
  initializeApp: (config: Record<string, unknown>) => any;
  credential: {
    cert: (serviceAccount: Record<string, unknown>) => unknown;
  };
};

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private messagingClient?: any;
  private firebaseInitAttempted = false;
  private cachedAccessToken?: { token: string; expiresAt: number };

  constructor(private configService: ConfigService) {}

  async sendPushNotification(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ) {
    if (!fcmTokens.length) {
      this.logger.debug('No FCM tokens available, skipping push');
      return;
    }

    const messaging = this.getMessagingClient();
    const uniqueTokens = Array.from(new Set(fcmTokens.filter(Boolean)));
    const messageData = data || {};
    const results = await Promise.allSettled(uniqueTokens.map((token) => this.sendSingleToken({
      token,
      title,
      body,
      data: messageData,
      messaging,
    })));

    const sentCount = results.filter((result) => result.status === 'fulfilled').length;
    const failedCount = results.length - sentCount;
    if (failedCount > 0) {
      this.logger.warn(`FCM send completed with failures. sent=${sentCount} failed=${failedCount}`);
    } else {
      this.logger.log(`FCM send completed. sent=${sentCount}`);
    }
  }

  async sendToTopic(topic: string, title: string, body: string, data?: Record<string, string>) {
    const messaging = this.getMessagingClient();

    try {
      if (messaging) {
        await messaging.send({
          topic,
          notification: { title, body },
          data: data || {},
        });
      } else {
        await this.sendViaHttpV1(
          {
            topic,
            notification: { title, body },
            data: data || {},
          },
          `topic:${topic}`,
        );
      }
      this.logger.log(`FCM topic notification sent to ${topic}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`FCM topic send failed for ${topic}: ${errorMessage}`);
    }
  }

  private getMessagingClient() {
    if (this.messagingClient) {
      return this.messagingClient;
    }

    if (this.firebaseInitAttempted) {
      return undefined;
    }
    this.firebaseInitAttempted = true;

    const firebaseAdmin = this.loadFirebaseAdmin();
    if (!firebaseAdmin) {
      return undefined;
    }

    const serviceAccount = this.resolveServiceAccount();
    if (!serviceAccount) {
      return undefined;
    }

    try {
      if (!firebaseAdmin.apps.length) {
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount),
          projectId: String(serviceAccount.project_id || serviceAccount.projectId || ''),
        });
      }

      this.messagingClient = firebaseAdmin.app().messaging();
      return this.messagingClient;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Firebase Admin SDK: ${errorMessage}`);
      return undefined;
    }
  }

  private loadFirebaseAdmin() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      return require('firebase-admin') as FirebaseAdmin;
    } catch {
      return undefined;
    }
  }

  private resolveServiceAccount() {
    const rawServiceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (rawServiceAccount) {
      try {
        const parsed = JSON.parse(rawServiceAccount);
        parsed.private_key = String(parsed.private_key || '').replace(/\\n/g, '\n');
        return parsed;
      } catch {
        this.logger.error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
        return undefined;
      }
    }

    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      return undefined;
    }

    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  private async sendSingleToken(params: {
    token: string;
    title: string;
    body: string;
    data: Record<string, string>;
    messaging?: any;
  }) {
    if (params.messaging) {
      await params.messaging.send({
        token: params.token,
        notification: { title: params.title, body: params.body },
        data: params.data,
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
        apns: {
          payload: {
            aps: { sound: 'default' },
          },
        },
      });
      return;
    }

    await this.sendViaHttpV1(
      {
        token: params.token,
        notification: { title: params.title, body: params.body },
        data: params.data,
      },
      `token:${params.token.slice(0, 8)}`,
    );
  }

  private async sendViaHttpV1(message: Record<string, unknown>, destinationLabel: string) {
    const serviceAccount = this.resolveServiceAccount();
    if (!serviceAccount) {
      this.logger.warn('Firebase credentials not configured, skipping FCM send');
      return;
    }

    const projectId = String(serviceAccount.project_id || serviceAccount.projectId || '').trim();
    if (!projectId) {
      this.logger.warn('Firebase project id is missing, skipping FCM send');
      return;
    }

    const accessToken = await this.getGoogleAccessToken(serviceAccount);
    if (!accessToken) {
      this.logger.warn('Unable to acquire Google access token, skipping FCM send');
      return;
    }

    await axios.post(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      { message },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    this.logger.debug(`FCM HTTP v1 sent to ${destinationLabel}`);
  }

  private async getGoogleAccessToken(serviceAccount: Record<string, unknown>) {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > now + 30) {
      return this.cachedAccessToken.token;
    }

    const clientEmail = String(serviceAccount.client_email || '').trim();
    const privateKey = String(serviceAccount.private_key || '').trim();
    if (!clientEmail || !privateKey) {
      return undefined;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const jwt = require('jsonwebtoken') as {
        sign: (
          payload: Record<string, unknown>,
          secretOrPrivateKey: string,
          options: { algorithm: string },
        ) => string;
      };

      const assertion = jwt.sign(
        {
          iss: clientEmail,
          scope: 'https://www.googleapis.com/auth/firebase.messaging',
          aud: 'https://oauth2.googleapis.com/token',
          iat: now,
          exp: now + 3600,
        },
        privateKey,
        { algorithm: 'RS256' },
      );

      const body = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString();

      const response = await axios.post(
        'https://oauth2.googleapis.com/token',
        body,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const token = String(response.data?.access_token || '');
      const expiresIn = Number(response.data?.expires_in || 3600);
      if (!token) {
        return undefined;
      }

      this.cachedAccessToken = {
        token,
        expiresAt: now + expiresIn,
      };
      return token;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch Google access token: ${errorMessage}`);
      return undefined;
    }
  }
}
