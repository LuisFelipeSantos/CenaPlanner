import type { Senders, Delivery } from './notification-service';
// Contract for a server-controlled gateway that wraps the chosen email provider
// for transactional email. Gateways must honor Idempotency-Key.
export function deliveryAdapters(config: {
  EMAIL_GATEWAY_URL?: string;
  NOTIFICATION_GATEWAY_TOKEN?: string;
}): Senders {
  const senders: Senders = {};
  for (const channel of ['email'] as const) {
    const url = config.EMAIL_GATEWAY_URL;
    if (!url || !config.NOTIFICATION_GATEWAY_TOKEN) continue;
    if (new URL(url).protocol !== 'https:') throw new Error('HTTPS required');
    senders[channel] = async (delivery: Delivery) => {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${config.NOTIFICATION_GATEWAY_TOKEN}`,
          'Idempotency-Key': delivery.idempotencyKey,
        },
        body: JSON.stringify(delivery),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Delivery failed');
    };
  }
  return senders;
}
