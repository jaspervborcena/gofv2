import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import nodemailer from 'nodemailer';

interface ContactRequest {
  email?: string;
  message?: string;
  userId?: string | null;
  displayName?: string | null;
}

@Injectable()
export class ContactService {
  private readonly secretClient = new SecretManagerServiceClient();
  private secretValues?: Promise<{ smtpUser: string; smtpPass: string; supportEmail: string }>;

  async send(request: ContactRequest): Promise<{ success: true; message: string }> {
    const email = String(request.email ?? '').trim();
    const message = String(request.message ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message || message.length > 500) {
      throw new BadRequestException('Enter a valid email and a message of 500 characters or fewer.');
    }

    const secrets = await this.loadSecrets();
    if (!secrets.smtpUser || !secrets.smtpPass) {
      throw new ServiceUnavailableException('Email delivery is not configured on the contact service.');
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: (process.env.SMTP_SECURE ?? 'true') === 'true' || Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: secrets.smtpUser, pass: secrets.smtpPass }
    });
    const text = [
      'New Game of Fortunes contact request',
      '',
      `From: ${email}`,
      request.userId ? `User ID: ${request.userId}` : 'User ID: not signed in',
      request.displayName ? `Display name: ${request.displayName}` : 'Display name: not provided',
      '',
      'Message:',
      message
    ].join('\n');

    try {
      await transporter.sendMail({
        from: `Game of Fortunes Contact <${secrets.smtpUser}>`,
        to: secrets.supportEmail,
        replyTo: email,
        subject: `Contact form submission from ${email}`,
        text
      });
    } catch (error) {
      const mailError = error as { code?: unknown; responseCode?: unknown };
      console.error('Contact email delivery failed.', {
        code: typeof mailError.code === 'string' ? mailError.code : 'unknown',
        responseCode: typeof mailError.responseCode === 'number' ? mailError.responseCode : undefined
      });
      throw new ServiceUnavailableException('We could not send your message right now. Please try again later.');
    }

    return { success: true, message: 'Message sent successfully.' };
  }

  private loadSecrets(): Promise<{ smtpUser: string; smtpPass: string; supportEmail: string }> {
    this.secretValues ??= this.readSecrets();
    return this.secretValues;
  }

  private async readSecrets(): Promise<{ smtpUser: string; smtpPass: string; supportEmail: string }> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'gameoffortunes-32578';
    if (!process.env.K_SERVICE && !process.env.GOOGLE_APPLICATION_CREDENTIALS
      && !process.env.SMTP_USER && !process.env.SMTP_PASS) {
      this.secretValues = undefined;
      throw new ServiceUnavailableException('Set SMTP credentials locally or run the contact API on Cloud Run with Secret Manager access.');
    }

    const readSecret = async (name: string): Promise<string> => {
      if (process.env[name]) {
        return process.env[name];
      }
      const [version] = await this.secretClient.accessSecretVersion({
        name: `projects/${projectId}/secrets/${name}/versions/latest`
      });
      return version.payload?.data?.toString('utf8').trim() ?? '';
    };

    try {
      const [smtpUser, storedSmtpPass, configuredSupportEmail] = await Promise.all([
        readSecret('SMTP_USER'),
        readSecret('SMTP_PASS'),
        readSecret('SUPPORT_EMAIL').catch(() => '')
      ]);
      return {
        smtpUser,
        smtpPass: storedSmtpPass.replace(/\s+/g, ''),
        supportEmail: configuredSupportEmail || 'gameoffortunes777@gmail.com'
      };
    } catch (error) {
      this.secretValues = undefined;
      throw new ServiceUnavailableException('The contact service cannot access its email secrets in Google Secret Manager.');
    }
  }
}