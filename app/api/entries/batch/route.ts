import { financeApi } from '@/app/finance-api';
export function POST(request: Request) {
  return financeApi(request, (service, body) => service.batchEntries(body));
}
