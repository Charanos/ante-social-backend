import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { Types } from 'mongoose';
import { WalletService } from '../../wallet/wallet.service';

@Injectable()
export class NowPaymentsService {
  private readonly logger = new Logger(NowPaymentsService.name);
  private readonly baseUrl = 'https://api.nowpayments.io/v1';

  constructor(
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
  ) {}

  private get apiKey(): string {
    return this.configService.get<string>('NOWPAYMENTS_API_KEY', '');
  }

  private get ipnSecret(): string {
    return (
      this.configService.get<string>('NOWPAYMENTS_IPN_SECRET', '') ||
      this.configService.get<string>('NOWPAYMENTS_IPN_KEY', '')
    );
  }

  async createPayment(userId: string, amount: number, currency: string = 'USD') {
    if (!this.apiKey) {
      this.logger.warn('NOWPayments API key not configured');
      throw new BadRequestException('Crypto payments not configured');
    }

    const normalizedCurrency = currency.toUpperCase();
    const pendingTx = await this.walletService.createProviderDepositTransaction({
      userId,
      amount,
      currency: normalizedCurrency,
      provider: 'nowpayments',
      description: `USDT TRC20 deposit (${normalizedCurrency})`,
      paymentMetadata: {
        requestedPayCurrency: 'usdttrc20',
      },
    });

    try {
      const orderId = `ANTE-${pendingTx._id.toString()}-${Date.now()}`;
      const { data } = await axios.post(
        `${this.baseUrl}/payment`,
        {
          price_amount: amount,
          price_currency: normalizedCurrency.toLowerCase(),
          pay_currency: 'usdttrc20',
          order_id: orderId,
          order_description: `Ante Social deposit ${pendingTx._id.toString()}`,
          ipn_callback_url:
            this.configService.get('NOWPAYMENTS_IPN_URL') ||
            this.configService.get('NOWPAYMENTS_CALLBACK_URL'),
          success_url: this.configService.get('NOWPAYMENTS_SUCCESS_URL'),
          cancel_url: this.configService.get('NOWPAYMENTS_CANCEL_URL'),
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      await this.walletService.markTransactionProcessing(pendingTx._id.toString(), {
        externalTransactionId: data.payment_id,
        paymentMetadata: {
          orderId,
          payAddress: data.pay_address,
          payAmount: data.pay_amount,
          payCurrency: data.pay_currency,
          invoiceId: data.purchase_id,
        },
      });

      this.logger.log(`NOWPayments invoice created for user ${userId}: ${data.payment_id}`);
      return {
        transactionId: pendingTx._id.toString(),
        paymentId: data.payment_id,
        payAddress: data.pay_address,
        payCurrency: data.pay_currency,
        payAmount: data.pay_amount,
        expiresAt: data.expiration_estimate_date,
        status: data.payment_status,
      };
    } catch (error: any) {
      await this.walletService.failPendingTransaction(
        pendingTx._id.toString(),
        'nowpayments_invoice_creation_failed',
      );
      this.logger.error(
        'Failed to create NOWPayments invoice',
        error.response?.data || error.message,
      );
      throw new BadRequestException('Failed to create crypto payment');
    }
  }

  async getPaymentStatus(paymentId: string) {
    try {
      const { data } = await axios.get(`${this.baseUrl}/payment/${paymentId}`, {
        headers: { 'x-api-key': this.apiKey },
      });
      return {
        paymentId: data.payment_id,
        status: data.payment_status,
        actuallyPaid: data.actually_paid,
        payCurrency: data.pay_currency,
      };
    } catch (error: any) {
      this.logger.error(`Failed to check payment ${paymentId}`, error.message);
      throw new BadRequestException('Failed to check payment status');
    }
  }

  async handleIpnCallback(body: any, signature: string) {
    this.verifySignature(body, signature);

    const paymentId = String(body.payment_id || '');
    const paymentStatus = String(body.payment_status || '').toLowerCase();
    const orderId = String(body.order_id || '');
    const parsedTransactionId = this.extractTransactionId(orderId);

    const transaction =
      (paymentId
        ? await this.walletService.findProviderTransaction('nowpayments', paymentId)
        : null) ||
      (parsedTransactionId
        ? await this.walletService.getTransactionById(parsedTransactionId)
        : null);

    if (!transaction) {
      this.logger.warn(`NOWPayments IPN could not map transaction. paymentId=${paymentId}`);
      return { success: true, ignored: true };
    }

    if (paymentStatus === 'finished' || paymentStatus === 'confirmed') {
      const completed = await this.walletService.completePendingDeposit(transaction._id.toString(), {
        externalTransactionId: paymentId || transaction.externalTransactionId,
        paymentMetadata: {
          ipnStatus: paymentStatus,
          actuallyPaid: body.actually_paid,
          actuallyPaidAtFiat: body.actually_paid_at_fiat,
          payCurrency: body.pay_currency,
          orderId,
          confirmedAt: new Date().toISOString(),
        },
      });

      return {
        success: true,
        transactionId: completed._id.toString(),
        userId: completed.userId.toString(),
        status: completed.status,
      };
    }

    if (['failed', 'expired', 'refunded'].includes(paymentStatus)) {
      const failed = await this.walletService.failPendingTransaction(
        transaction._id.toString(),
        `nowpayments_${paymentStatus}`,
        {
          externalTransactionId: paymentId || transaction.externalTransactionId,
          paymentMetadata: {
            ipnStatus: paymentStatus,
            orderId,
          },
        },
      );

      return {
        success: true,
        transactionId: failed._id.toString(),
        status: failed.status,
      };
    }

    await this.walletService.markTransactionProcessing(transaction._id.toString(), {
      externalTransactionId: paymentId || transaction.externalTransactionId,
      paymentMetadata: {
        ipnStatus: paymentStatus,
        orderId,
      },
    });

    return { success: true, status: paymentStatus };
  }

  async getAvailableCurrencies() {
    try {
      const { data } = await axios.get(`${this.baseUrl}/currencies`, {
        headers: { 'x-api-key': this.apiKey },
      });
      return data.currencies;
    } catch (error: any) {
      this.logger.error('Failed to get currencies', error.message);
      return [];
    }
  }

  private verifySignature(body: Record<string, unknown>, signature: string) {
    if (!signature) {
      throw new BadRequestException('Missing NOWPayments signature');
    }
    if (!this.ipnSecret) {
      throw new BadRequestException('NOWPayments IPN secret is not configured');
    }

    const sortedBody = JSON.stringify(this.sortObject(body));
    const expectedSignature = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sortedBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new BadRequestException('Invalid NOWPayments signature');
    }
  }

  private extractTransactionId(orderId: string) {
    const parts = orderId.split('-');
    if (parts.length < 2) {
      return undefined;
    }
    const candidate = parts[1];
    return Types.ObjectId.isValid(candidate) ? candidate : undefined;
  }

  private sortObject(obj: unknown): unknown {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return obj;
    }

    return Object.keys(obj as Record<string, unknown>)
      .sort()
      .reduce((acc: Record<string, unknown>, key: string) => {
        const value = (obj as Record<string, unknown>)[key];
        acc[key] = this.sortObject(value);
        return acc;
      }, {});
  }
}
