'use client';
import { useEffect, useState } from 'react';
export default function SessionGuard({ authenticated, children }: { authenticated: boolean; children: React.ReactNode }) {
  const [checking, setChecking] = useState(!authenticated);
  useEffect(() => {
    let active = true;
    let pending = false;
    async function renew() {
      if (pending) return;
      pending = true;
      try {
        const result = await fetch('/api/auth/refresh', { method: 'POST', signal: AbortSignal.timeout(15000) });
        if (!active) return;
        if (result.ok && !authenticated) location.replace('/');
        else if ((result.status === 401 || result.status === 400) && authenticated) location.replace('/');
      } catch { /* Keep the current view during temporary outages. */ }
      finally { pending = false; if (active) setChecking(false); }
    }
    void renew();
    const timer = setInterval(renew, 4 * 60 * 1000);
    const focus = () => { void renew(); };
    window.addEventListener('focus', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [authenticated]);
  if (checking) return <main className="grid min-h-screen place-items-center" role="status">Verificando seu acesso…</main>;
  return children;
}
