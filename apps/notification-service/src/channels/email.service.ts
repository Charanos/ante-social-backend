import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromEmail: string;

  constructor(private configService: ConfigService) {
    this.fromEmail = 'info@antesocial.com';

    this.transporter = nodemailer.createTransport({
      host: 'rs10.rcnoc.com',
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: 'info@antesocial.com',
        pass: 'CrDw8G8^Av8q9gws',
      },
    });

    this.transporter.verify((error, success) => {
      if (error) {
        this.logger.error('SMTP Connection Failed', error);
      } else {
        this.logger.log('SMTP Server is ready to take our messages');
      }
    });
  }

  private getHtmlTemplate(content: string, title: string): string {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    // Use an absolute URL for the logo assuming it's hosted at frontendUrl
    const logoUrl = `${frontendUrl}/ante-logo.png`;
    const year = new Date().getFullYear();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #000000;
      color: #ffffff;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      background-color: #000000;
      padding: 40px 20px;
      width: 100%;
    }
    .container {
      max-width: 500px;
      margin: 0 auto;
      background-color: #080808;
      border: 1px solid #1a1a1a;
      border-radius: 16px;
      overflow: hidden;
    }
    .header {
      text-align: center;
      padding: 40px 20px 20px;
    }
    .logo {
      width: 100px;
      height: auto;
    }
    .content {
      padding: 20px 40px 40px;
      text-align: center;
    }
    h1 {
      font-size: 24px;
      font-weight: 500;
      margin: 0 0 16px 0;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    p {
      color: #a3a3a3;
      font-size: 15px;
      line-height: 1.6;
      margin: 0 0 24px 0;
    }
    .otp-code {
      display: inline-block;
      background-color: rgba(249, 115, 22, 0.1);
      border: 1px solid rgba(249, 115, 22, 0.2);
      color: #f97316;
      font-size: 36px;
      font-weight: 600;
      letter-spacing: 12px;
      padding: 16px 24px 16px 36px;
      border-radius: 12px;
      margin: 16px 0 32px 0;
    }
    .btn {
      display: inline-block;
      background-color: #ffffff;
      color: #000000;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 30px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      font-size: 13px;
      margin-top: 8px;
    }
    .footer {
      text-align: center;
      padding: 30px 40px;
      background-color: #040404;
      border-top: 1px solid #1a1a1a;
    }
    .footer p {
      color: #666666;
      font-size: 12px;
      margin: 0 0 8px 0;
    }
    .footer p.tagline {
      color: #888888;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="container" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td class="header">
          <a href="${frontendUrl}" target="_blank">
            <!-- If the image cannot be loaded initially it will show alt text until the server serves public files -->
            <img src="${logoUrl}" alt="Ante Social" class="logo" />
          </a>
        </td>
      </tr>
      <tr>
        <td class="content">
          ${content}
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p class="tagline">High stakes, zero compromise. The table is set.</p>
          <p>© ${year} Ante Social. All rights reserved.</p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
  }

  async sendWelcomeEmail(to: string, username: string) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const content = `
      <h1>Welcome to the inner circle.</h1>
      <p>Hello ${username}, your identity has been successfully registered.</p>
      <p>Fund your wallet and step up to the table to begin forecasting.</p>
      <a href="${frontendUrl}/dashboard" class="btn">Enter Dashboard</a>
    `;

    await this.sendEmail({
      to,
      subject: 'Welcome to Ante Social',
      text: `Hello ${username}, welcome to Ante Social! Fund your wallet to begin.`,
      html: this.getHtmlTemplate(content, 'Welcome to Ante Social'),
    });
  }

  async sendVerificationEmail(to: string, code: string) {
    const content = `
      <h1>Verify your identity</h1>
      <p>Enter the 6-digit code below to verify your email address and complete registration.</p>
      <div class="otp-code">${code}</div>
      <p>If you didn't request this code, you can safely ignore this email.</p>
    `;

    await this.sendEmail({
      to,
      subject: 'Ante Social verification code',
      text: `Your verification code is: ${code}`,
      html: this.getHtmlTemplate(content, 'Verify Your Email'),
    });
  }

  async sendNotificationEmail(to: string, title: string, message: string) {
    const content = `
      <h1>${title}</h1>
      <p>${message}</p>
    `;

    await this.sendEmail({
      to,
      subject: title,
      text: message,
      html: this.getHtmlTemplate(content, title),
    });
  }

  private async sendEmail(payload: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) {
    try {
      console.log(`[EmailService] Attempting to send email to ${payload.to} with subject: ${payload.subject}`);
      const info = await this.transporter.sendMail({
        from: this.fromEmail,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
        html: payload.html || payload.text,
      });
      this.logger.log(`Sent email "${payload.subject}" to ${payload.to}. MessageId: ${info.messageId}`);
      console.log(`[EmailService] Successfully sent email to ${payload.to}. MessageId: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Error sending email to ${payload.to}`, error);
      console.error(`[EmailService] CRITICAL Error sending email to ${payload.to}:`, error);
    }
  }
}
