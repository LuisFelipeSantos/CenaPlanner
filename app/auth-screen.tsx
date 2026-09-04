'use client';
import { useState } from 'react';
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from './brand-logo';
import { Input } from '@/components/ui/input';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    const data = new FormData(event.currentTarget);
    const body = {
      name: String(data.get('name') || ''),
      email: String(data.get('email')),
      password: String(data.get('password')),
    };
    if (mode === 'signup' && body.password !== data.get('confirmPassword')) {
      setError('As senhas não coincidem. Confira os dois campos.');
      setBusy(false);
      return;
    }
    try {
    const r = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(18000),
    });
    const result = (await r.json()) as {
      error?: string;
      needsConfirmation?: boolean;
      ok?: boolean;
    };
    setBusy(false);
    if (!r.ok || !result.ok) {
      setError(result.error || 'Não foi possível continuar.');
      return;
    }
    if (result.needsConfirmation) {
      setMessage('Solicitação recebida. Confira seu e-mail e a pasta de spam. Se receber a confirmação, abra o link e depois volte aqui para entrar. Se já tem conta, use sua senha.');
      setMode('login');
      return;
    }
    location.href = '/';
    } catch {
      setError('Não foi possível concluir a conexão. Verifique sua internet e tente novamente.');
    } finally { setBusy(false); }
  }
  return (
    <main className="grid min-h-screen bg-[#f3f6f2] lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#173f31] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandLogo/>
          <b className="text-xl">Meu Controle</b>
        </div>
        <div className="max-w-lg">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[.22em] text-[#9dd5b2]">
            Finanças sem complicação
          </p>
          <h1 className="text-5xl font-bold leading-tight tracking-tight">
            Seu dinheiro organizado, mês após mês.
          </h1>
          <p className="mt-5 text-lg leading-8 text-white/65">
            Acompanhe receitas, despesas, contas pendentes e a evolução de todos
            os anos em um só lugar.
          </p>
        </div>
        <p className="text-sm text-white/45">
          Privado, seguro e feito para sua rotina.
        </p>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandLogo/>
            <b>Meu Controle</b>
          </div>
          <p className="text-sm font-semibold text-[#19714e]">
            {mode === 'login' ? 'Bem-vindo de volta' : 'Comece agora'}
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">
            {mode === 'login' ? 'Entre na sua conta' : 'Crie sua conta'}
          </h2>
          <p className="mb-7 mt-2 text-[#6d7a73]">
            {mode === 'login'
              ? 'Acesse seu controle financeiro.'
              : 'Leva menos de um minuto.'}
          </p>
          <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
            {mode === 'signup' && (
              <label className="block text-sm font-medium">
                Nome
                <div className="relative mt-2">
                  <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#87928b]" />
                  <Input
                    name="name"
                    autoComplete="name"
                    maxLength={100}
                    disabled={busy}
                    required
                    className="h-11 bg-white pl-10"
                    placeholder="Seu nome"
                  />
                </div>
              </label>
            )}
            <label className="block text-sm font-medium">
              E-mail
              <div className="relative mt-2">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#87928b]" />
                <Input
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  disabled={busy}
                  required
                  type="email"
                  className="h-11 bg-white pl-10"
                  placeholder="voce@email.com"
                />
              </div>
            </label>
            <label className="block text-sm font-medium">
              Senha
              <div className="relative mt-2">
                <LockKeyhole className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#87928b]" />
                <Input
                  name="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  maxLength={256}
                  disabled={busy}
                  required
                  minLength={mode === 'signup' ? 6 : 1}
                  type={show ? 'text' : 'password'}
                  className="h-11 bg-white px-10"
                  placeholder="Mínimo de 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6d7a73]"
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={show}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {mode === 'signup' && <label className="block text-sm font-medium">Confirmar senha<Input name="confirmPassword" required minLength={6} maxLength={256} autoComplete="new-password" type={show ? 'text' : 'password'} disabled={busy} className="mt-2 h-11 bg-white" placeholder="Digite a senha novamente" /></label>}
            {error && (
              <p role="alert" className="rounded-xl bg-[#fbe9e5] p-3 text-sm text-[#a33e32]">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="rounded-xl bg-[#e5f3eb] p-3 text-sm text-[#19714e]">
                {message}
              </p>
            )}
            <Button
              type="submit"
              disabled={busy}
              className="h-11 w-full bg-[#184e3a] text-base"
            >
              {busy
                ? 'Aguarde...'
                : mode === 'login'
                  ? 'Entrar'
                  : 'Criar conta'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-[#6d7a73]">
            {mode === 'login'
              ? 'Ainda não tem uma conta?'
              : 'Já possui uma conta?'}{' '}
            <button
              disabled={busy}
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError('');
                setMessage('');
              }}
              className="font-semibold text-[#184e3a]"
            >
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
