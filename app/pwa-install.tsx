'use client';

import { Download, Share } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export default function PwaInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const detectPlatform = () => {
      setInstalled(isStandalone());
      setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    };
    queueMicrotask(detectPlatform);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  if (installed) {
    return <p className="text-xs text-[#6d7a73]">CenaPlanner já está instalado neste dispositivo.</p>;
  }
  if (prompt) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice.outcome === 'accepted') setPrompt(null);
        }}
      >
        <Download />
        Instalar aplicativo
      </Button>
    );
  }
  if (isIos) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-sm text-[#526159]">
        <Share className="mt-0.5 size-4 shrink-0" />
        No iPhone: toque em Compartilhar → Adicionar à Tela de Início.
      </p>
    );
  }
  return (
    <p className="text-xs text-[#6d7a73]">
      A instalação aparecerá aqui quando o navegador permitir. Lançamentos continuam exigindo internet.
    </p>
  );
}
