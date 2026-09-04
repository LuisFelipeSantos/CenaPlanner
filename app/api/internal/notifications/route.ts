import { env } from 'cloudflare:workers';
import { notificationService } from '@/app/notification-service';
import { deliveryAdapters } from '@/app/notification-delivery';
export async function POST(request: Request) {
  if (!env.NOTIFICATION_CRON_SECRET)
    return Response.json(
      { error: 'Scheduler not configured' },
      { status: 503 },
    );
  const expected = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode('Bearer ' + env.NOTIFICATION_CRON_SECRET),
    ),
  );
  const received = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(request.headers.get('authorization') || ''),
    ),
  );
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++)
    mismatch |= expected[i] ^ received[i];
  if (mismatch)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const service = notificationService(env.DB);
    const cursor = new URL(request.url).searchParams.get('cursor') || '';
    const scan =
      new URL(request.url).searchParams.get('mode') === 'dispatch'
        ? { processed: 0, nextCursor: null }
        : await service.scan(undefined, undefined, cursor);
    const delivery = await service.dispatch(deliveryAdapters(env));
    return Response.json(
      { ...scan, ...delivery },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 503 },
    );
  }
}
