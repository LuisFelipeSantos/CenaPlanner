'use client';
import { useEffect, useState } from 'react';
import { Bell, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverDescription,
  PopoverTrigger,
} from '@/components/ui/popover';
type Prefs = {
  email: string;
  in_app: number;
  email_enabled: number;
};
type Item = {
  id: string;
  name: string;
  dueDate: string;
  offsetDays: number;
  readAt: string | null;
  period: string;
};
async function scanAll() {
  let cursor = '';
  for (let page = 0; page < 50; page++) {
    const result = await request<{ nextCursor: string | null }>(
      'POST',
      '/api/notifications?cursor=' + encodeURIComponent(cursor),
      {},
    );
    if (!result.nextCursor) return;
    cursor = result.nextCursor;
  }
  throw new Error('Muitos alertas pendentes; tente atualizar novamente.');
}
async function request<T>(
  method: string,
  path: string,
  body?: object,
): Promise<T> {
  const options: RequestInit = { method, signal: AbortSignal.timeout(20000) };
  if (body) {
    options.headers = { 'content-type': 'application/json' };
    options.body = JSON.stringify(body);
  }
  const r = await fetch(path, options);
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok || data.error)
    throw new Error(data.error || 'Não foi possível acessar as notificações.');
  return data;
}
export default function NotificationCenter({
  revision,
  onOpenMonth,
}: {
  revision: number;
  onOpenMonth: (period: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [data, setData] = useState<{ items: Item[]; unread: number }>({
      items: [],
      unread: 0,
    }),
    [prefs, setPrefs] = useState<Prefs | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        await scanAll();
        const value = await request<{ items: Item[]; unread: number }>(
          'GET',
          '/api/notifications',
        );
        if (active) {
          setData(value);
          setError('');
        }
      } catch {
        if (active) setError('Não foi possível atualizar os alertas.');
      }
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision]);
  async function configure() {
    setBusy(true);
    setError('');
    try {
      setPrefs(await request<Prefs>('GET', '/api/notifications/preferences'));
      setSettings(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setBusy(false);
    }
  }
  async function read(id: string) {
    setBusy(true);
    try {
      await request('PATCH', '/api/notifications', { id });
      setData(await request('GET', '/api/notifications'));
    } catch {
      setError('Não foi possível marcar como lida.');
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      setPrefs(
        await request('POST', '/api/notifications/preferences', {
          inApp: form.has('inApp'),
          emailEnabled: form.has('emailEnabled'),
        }),
      );
      setMessage(
        'Preferências salvas. Envios externos dependem de integração e agendamento ativos.',
      );
      await scanAll();
      setData(await request('GET', '/api/notifications'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        if (!busy) setOpen(value);
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" />}
        className="relative"
        aria-label={'Notificações, ' + data.unread + ' não lidas'}
        onClick={() => {
          setSettings(false);
          setMessage('');
        }}
      >
        <Bell />
        {data.unread > 0 && (
          <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(90vw,420px)] max-h-[80vh] overflow-y-auto p-4"
      >
        <PopoverTitle>
          {settings ? 'Configurações de notificações' : 'Notificações'}
        </PopoverTitle>
        <PopoverDescription>
          Alertas de despesas: 7, 3 e 1 dia antes e no vencimento. Despesas
          pagas ou sem vencimento não geram alertas.
        </PopoverDescription>
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        {message && <output>{message}</output>}
        {settings && prefs ? (
          <form onSubmit={save} className="space-y-4">
            <fieldset disabled={busy} className="space-y-4">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  name="inApp"
                  defaultChecked={!!prefs.in_app}
                />
                Notificação no sistema (Sininho)
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  name="emailEnabled"
                  defaultChecked={!!prefs.email_enabled}
                />
                Notificação por e-mail
              </label>
              <p className="text-xs">E-mail do cadastro: {prefs.email}</p>
              <p className="text-xs text-[#6d7a73]">
                O envio de e-mail requer integração e agendamento ativos.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar preferências'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSettings(false)}
              >
                Voltar
              </Button>
            </fieldset>
          </form>
        ) : (
          <>
            <Button variant="outline" onClick={configure} disabled={busy}>
              <Settings />
              Configurações de notificações
            </Button>
            {data.items.length === 0 ? (
              <p className="py-6 text-center">Nenhum alerta de vencimento.</p>
            ) : (
              data.items.map((item) => (
                <article
                  key={item.id}
                  className={
                    'rounded-lg border p-3 ' +
                    (item.readAt ? '' : 'bg-green-50')
                  }
                >
                  <b>{item.name}</b>
                  <p className="text-sm font-semibold text-red-700">
                    Vencimento: {item.dueDate.split('-').reverse().join('/')} ·
                    Alerta{' '}
                    {item.offsetDays === 0 ? 'do dia' : 'D-' + item.offsetDays}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setOpen(false);
                        onOpenMonth(item.period);
                      }}
                    >
                      Abrir mês
                    </Button>
                    {!item.readAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => read(item.id)}
                      >
                        Marcar como lida
                      </Button>
                    )}
                  </div>
                </article>
              ))
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
