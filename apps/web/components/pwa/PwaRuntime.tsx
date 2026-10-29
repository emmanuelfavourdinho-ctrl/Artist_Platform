'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { clearQueueForOtherAccounts, clearQueuedMessages } from '../../lib/offlineMessageQueue';
import { registerServiceWorker } from '../../lib/pwaClient';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function PwaRuntime() {
  const { firebaseUser, loading } = useAuth();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    void registerServiceWorker(
      typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
      process.env.NODE_ENV === 'production',
    );
  }, []);

  useEffect(() => {
    if (loading) return;
    if (firebaseUser) void clearQueueForOtherAccounts(firebaseUser.uid).catch(() => {});
    else void clearQueuedMessages().catch(() => {});
  }, [firebaseUser?.uid, loading]);

  useEffect(() => {
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!installPrompt) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-lg items-center gap-3 rounded-lg border border-border/15 bg-surface p-3 shadow-2xl [padding-bottom:calc(.75rem+env(safe-area-inset-bottom))] sm:bottom-5">
      <p className="min-w-0 flex-1 text-sm text-foreground">Install Fine Arts for quicker access.</p>
      <button
        type="button"
        onClick={async () => {
          await installPrompt.prompt();
          await installPrompt.userChoice;
          setInstallPrompt(null);
        }}
        className="min-h-10 shrink-0 rounded-full bg-accent px-4 text-xs font-semibold text-accent-foreground hover:opacity-90"
      >
        Install
      </button>
      <button type="button" aria-label="Dismiss install suggestion" onClick={() => setInstallPrompt(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-white/[.06]">×</button>
    </aside>
  );
}
