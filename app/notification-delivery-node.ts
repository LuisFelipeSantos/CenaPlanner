import nodemailer from 'nodemailer';
import type { Delivery, Senders } from './notification-service';

type Config = {
  GMAIL_SMTP_USER?: string;
  GMAIL_APP_PASSWORD?: string;
};

export function deliveryAdapters(config: Config): Senders {
  const user = config.GMAIL_SMTP_USER?.trim();
  const password = config.GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  if (!user || !password) return {};
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
  return {
    email: async (delivery: Delivery) => {
      await transporter.sendMail({
        from: `Meu Controle <${user}>`,
        to: delivery.to,
        subject: delivery.subject,
        text: delivery.text,
        html: delivery.html,
        headers: { 'X-Entity-Ref-ID': delivery.idempotencyKey },
      });
    },
  };
}
