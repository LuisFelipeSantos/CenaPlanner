import { financeApi } from '@/app/finance-api';
export function GET(request: Request) {
  return financeApi(request, (service) => service.getProfile());
}
export function POST(request: Request) {
  return financeApi(request, (service, body) => service.saveProfile(body));
}
