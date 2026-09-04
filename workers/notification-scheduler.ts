// Deploy separately only after configuring the target Site and its secret.
// Daily scan at 09:00 Sao Paulo, with a separate retry trigger.
const notificationScheduler = {
  async scheduled(
    event: { cron: string },
    env: { SITE_ORIGIN: string; NOTIFICATION_CRON_SECRET: string },
  ) {
    if (new URL(env.SITE_ORIGIN).protocol !== 'https:')
      throw new Error('HTTPS required');
    let cursor = '';
    for (let page = 0; page < 50; page++) {
      const url = new URL('/api/internal/notifications', env.SITE_ORIGIN);
      if (event.cron !== '0 12 * * *') url.searchParams.set('mode', 'dispatch');
      if (cursor) url.searchParams.set('cursor', cursor);
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: 'Bearer ' + env.NOTIFICATION_CRON_SECRET },
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new Error('Notification scheduler request failed');
      const result = (await response.json()) as {
        nextCursor: string | null;
        examined: number;
        hasMore: boolean;
      };
      if (!result.nextCursor && !result.hasMore) return;
      cursor = result.nextCursor || cursor;
    }
    throw new Error(
      'Scan page limit reached; resume cursor with a queue consumer',
    );
  },
};
export default notificationScheduler;
