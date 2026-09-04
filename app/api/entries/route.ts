import { financeApi } from '@/app/finance-api';
export function GET(request: Request) {
  return financeApi(request, (service) =>
    service.listEntries(new URL(request.url).searchParams),
  );
}
export function POST(request: Request) {
  return financeApi(request, (service, body) => service.createEntry(body));
}
export function PATCH(request: Request) {
  return financeApi(request, (service, body) => service.changeEntry(body));
}
export function DELETE(request: Request) {
  return financeApi(request, (service, body) => service.deleteEntry(body));
}
