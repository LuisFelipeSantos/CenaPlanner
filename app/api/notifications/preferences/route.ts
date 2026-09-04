import { notificationApi } from '@/app/notification-api';
export function GET(request: Request) {
  return notificationApi(request, (s, u) => s.preferences(u.userId, u.email));
}
export function POST(request: Request) {
  return notificationApi(request, (s, u, b) =>
    s.savePreferences(u.userId, u.email, b),
  );
}
