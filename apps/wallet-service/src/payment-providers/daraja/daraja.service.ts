import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Request } from 'express';
import { TransactionStatus } from '@app/common';
import { WalletService } from '../../wallet/wallet.service';

@Injectable()
export class DarajaService {
  private readonly logger = new Logger(DarajaService.name);
  private tokenCache: { token: string; expiry: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
  ) {}

  async getAccessToken() {
    if (this.tokenCache && Date.now() < this.tokenCache.expiry) {
      return this.tokenCache.token;
    }

    const consumerKey = this.configService.get<string>('DARAJA_CONSUMER_KEY');
    const consumerSecret = this.configService.get<string>('DARAJA_CONSUMER_SECRET');
    if (!consumerKey || !consumerSecret) {
      throw new BadRequestException('Daraja is not configured');
    }

    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = this.configService.get('DARAJA_BASE_URL', 'https://sandbox.safaricom.co.ke');
    const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;

    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      this.tokenCache = {
        token: data.access_token,
        expiry: Date.now() + (parseInt(data.expires_in, 10) - 60) * 1000,
      };
      return data.access_token;
    } catch (error: any) {
      this.logger.error('Failed to get Daraja access token', error.message);
      throw new BadRequestException('Payment provider error');
    }
  }

  async initiateStkPush(userId: string, phoneNumber: string, amount: number) {
    const token = await this.getAccessToken();
    const baseUrl = this.configService.get('DARAJA_BASE_URL', 'https://sandbox.safaricom.co.ke');
    const shortcode = this.configService.get<string>('DARAJA_SHORTCODE');
    const passkey = this.configService.get<string>('DARAJA_PASSKEY');
    const callbackUrl = this.configService.get('DARAJA_CALLBACK_URL');

    if (!shortcode || !passkey || !callbackUrl) {
      throw new BadRequestException('Daraja STK configuration is incomplete');
    }

    const pendingTx = await this.walletService.createProviderDepositTransaction({
      userId,
      amount,
      currency: 'KSH',
      provider: 'mpesa',
      description: 'M-Pesa STK deposit',
      paymentMetadata: { phoneNumber },
    });

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, '')
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    try {
      const { data } = await axios.post(
        `${baseUrl}/mpesa/stkpush/v1/processrequest`,
        {
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: amount,
          PartyA: phoneNumber,
          PartyB: shortcode,
          PhoneNumber: phoneNumber,
          CallBackURL: callbackUrl,
          AccountReference: `ANTE-${pendingTx._id.toString()}`,
          TransactionDesc: 'Ante Social Deposit',
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await this.walletService.markTransactionProcessing(pendingTx._id.toString(), {
        externalTransactionId: data.CheckoutRequestID,
        paymentMetadata: {
          checkoutRequestId: data.CheckoutRequestID,
          merchantRequestId: data.MerchantRequestID,
          responseCode: data.ResponseCode,
          responseDescription: data.ResponseDescription,
          customerMessage: data.CustomerMessage,
          phoneNumber,
        },
      });

      this.logger.log(`STK Push initiated for user ${userId} tx=${pendingTx._id.toString()}`);
      return {
        success: true,
        transactionId: pendingTx._id.toString(),
        checkoutRequestId: data.CheckoutRequestID,
        message: 'STK Push sent to your phone. Please enter your M-Pesa PIN.',
      };
    } catch (error: any) {
      await this.walletService.failPendingTransaction(
        pendingTx._id.toString(),
        'mpesa_stk_initiation_failed',
      );
      this.logger.error('STK Push failed', error.response?.data || error.message);
      throw new BadRequestException('Failed to initiate M-Pesa payment');
    }
  }

  async handleStkCallback(data: any) {
    this.logger.log('STK Push callback received');

    const result = data?.Body?.stkCallback;
    if (!result) {
      return { ResultCode: 1, ResultDesc: 'Invalid callback' };
    }

    const checkoutRequestId = String(result.CheckoutRequestID || '');
    const transaction = checkoutRequestId
      ? await this.walletService.findProviderTransaction('mpesa', checkoutRequestId)
      : null;

    if (!transaction) {
      this.logger.warn(`No pending transaction mapped for checkoutId=${checkoutRequestId}`);
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    if (transaction.status === TransactionStatus.COMPLETED) {
      return { ResultCode: 0, ResultDesc: 'Already processed' };
    }

    if (result.ResultCode === 0) {
      const metadata = result.CallbackMetadata?.Item || [];
      const amount = Number(metadata.find((item: any) => item.Name === 'Amount')?.Value || transaction.amount);
      const receipt = metadata.find((item: any) => item.Name === 'MpesaReceiptNumber')?.Value;
      const phone = metadata.find((item: any) => item.Name === 'PhoneNumber')?.Value;

      await this.walletService.completePendingDeposit(transaction._id.toString(), {
        externalTransactionId: checkoutRequestId,
        creditedAmount: amount,
        paymentMetadata: {
          mpesaReceiptNumber: receipt,
          phoneNumber: phone,
          resultCode: result.ResultCode,
          resultDesc: result.ResultDesc,
          callbackReceivedAt: new Date().toISOString(),
        },
      });
    } else {
      await this.walletService.failPendingTransaction(
        transaction._id.toString(),
        `mpesa_stk_${result.ResultCode}`,
        {
          externalTransactionId: checkoutRequestId,
          paymentMetadata: {
            resultCode: result.ResultCode,
            resultDesc: result.ResultDesc,
            callbackReceivedAt: new Date().toISOString(),
          },
        },
      );
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async initiateB2C(userId: string, phoneNumber: string, amount: number) {
    const token = await this.getAccessToken();
    const baseUrl = this.configService.get('DARAJA_BASE_URL', 'https://sandbox.safaricom.co.ke');
    const shortcode = this.configService.get('DARAJA_B2C_SHORTCODE');
    const initiatorName = this.configService.get('DARAJA_INITIATOR_NAME');
    const securityCredential = this.configService.get('DARAJA_SECURITY_CREDENTIAL');

    if (!shortcode || !initiatorName || !securityCredential) {
      throw new BadRequestException('Daraja B2C configuration is incomplete');
    }

    const pendingWithdrawal = await this.walletService.reservePendingWithdrawalForProvider({
      userId,
      amount,
      currency: 'KSH',
      provider: 'mpesa',
      paymentMetadata: { phoneNumber },
    });

    try {
      const { data } = await axios.post(
        `${baseUrl}/mpesa/b2c/v3/paymentrequest`,
        {
          OriginatorConversationID: `ANTE-${pendingWithdrawal._id.toString()}-${Date.now()}`,
          InitiatorName: initiatorName,
          SecurityCredential: securityCredential,
          CommandID: 'BusinessPayment',
          Amount: amount,
          PartyA: shortcode,
          PartyB: phoneNumber,
          Remarks: 'Ante Social Withdrawal',
          QueueTimeOutURL: this.configService.get('DARAJA_B2C_TIMEOUT_URL'),
          ResultURL: this.configService.get('DARAJA_B2C_RESULT_URL'),
          Occasion: `Withdrawal-${userId.slice(-6)}`,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await this.walletService.markTransactionProcessing(pendingWithdrawal._id.toString(), {
        externalTransactionId: data.ConversationID,
        paymentMetadata: {
          originatorConversationId: data.OriginatorConversationID,
          responseDescription: data.ResponseDescription,
          phoneNumber,
        },
      });

      this.logger.log(`B2C initiated for tx ${pendingWithdrawal._id.toString()}`);
      return {
        success: true,
        transactionId: pendingWithdrawal._id.toString(),
        conversationId: data.ConversationID,
      };
    } catch (error: any) {
      await this.walletService.failPendingTransaction(
        pendingWithdrawal._id.toString(),
        'mpesa_b2c_initiation_failed',
      );
      this.logger.error('B2C failed', error.response?.data || error.message);
      throw new BadRequestException('Failed to process withdrawal');
    }
  }

  async handleB2CResult(data: any) {
    this.logger.log('B2C result callback received');
    const result = data?.Result;
    if (!result) {
      return { ResultCode: 1, ResultDesc: 'Invalid callback' };
    }

    const conversationId = String(result.ConversationID || '');
    const transaction = conversationId
      ? await this.walletService.findProviderTransaction('mpesa', conversationId)
      : null;

    if (!transaction) {
      this.logger.warn(`No transaction mapped for B2C conversationId=${conversationId}`);
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    if (result.ResultCode === 0) {
      await this.walletService.approveWithdrawal(transaction._id.toString());
    } else {
      await this.walletService.failPendingTransaction(
        transaction._id.toString(),
        `mpesa_b2c_${result.ResultCode}`,
        {
          externalTransactionId: conversationId,
          paymentMetadata: {
            resultCode: result.ResultCode,
            resultDesc: result.ResultDesc,
          },
        },
      );
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async handleB2CTimeout(data: any) {
    this.logger.log('B2C timeout callback received');
    const result = data?.Result;
    const conversationId = String(result?.ConversationID || result?.OriginatorConversationID || '');
    if (conversationId) {
      const transaction = await this.walletService.findProviderTransaction('mpesa', conversationId);
      if (transaction) {
        await this.walletService.failPendingTransaction(
          transaction._id.toString(),
          'mpesa_b2c_timeout',
          {
            paymentMetadata: {
              timeoutPayload: data,
            },
          },
        );
      }
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  validateCallbackRequest(request: Request) {
    const callbackToken = this.configService.get<string>('DARAJA_CALLBACK_TOKEN');
    if (callbackToken) {
      const provided = request.headers['x-callback-token'];
      if (provided !== callbackToken) {
        throw new BadRequestException('Invalid callback token');
      }
    }

    const allowedIps = (this.configService.get<string>('DARAJA_ALLOWED_IPS') || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!allowedIps.length) {
      return;
    }

    const forwardedFor = request.headers['x-forwarded-for'];
    const rawIp = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : request.ip;

    if (!rawIp || !allowedIps.includes(rawIp)) {
      throw new BadRequestException('Callback source is not allowed');
    }
  }
}
