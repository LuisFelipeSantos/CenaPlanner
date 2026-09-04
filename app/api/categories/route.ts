import { financeApi } from '@/app/finance-api';
export function GET(request: Request) {
  return financeApi(request, (service) => service.listCategories());
}
export function POST(request: Request) {
  return financeApi(request, (service, body) => service.saveCategory(body));
}
