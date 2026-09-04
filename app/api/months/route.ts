import { financeApi } from '@/app/finance-api';
export function POST(request: Request) {
  return financeApi(request, (service, body) => service.openMonth(body.period));
}
export function PATCH(request: Request) {
  return financeApi(request, (service, body) =>
    service.setMonthlySalary(body.period, body.amount),
  );
}
