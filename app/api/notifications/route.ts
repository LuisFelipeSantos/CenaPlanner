import { notificationApi } from '@/app/notification-api';
export function GET(request: Request) {
  return notificationApi(request, async (s, u) => {
    await s.preferences(u.userId, u.email);
    return s.list(u.userId);
  });
}
export function POST(request: Request) {
  return notificationApi(request, async (s, u) => {
    await s.preferences(u.userId, u.email);
    return s.scan(
      undefined,
      u.userId,
      new URL(request.url).searchParams.get('cursor') || '',
    );
  });
}
export function PATCH(request: Request) {
  return notificationApi(request, (s, u, b) => s.markRead(u.userId, b.id));
}
