import type { ReactNode } from 'react';
import { useSettings } from '../store/settings';

export function Page({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  actions?: ReactNode;
  /** Kept for old callers: the top bar replaces the back link. */
  back?: string | null;
}) {
  return (
    <main className="page__main">
      <header className="page__head">
        <div className="stack" style={{ gap: 8 }}>
          {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
          <h1 className="t-h1">{title}</h1>
        </div>
        {actions}
      </header>
      {children}
    </main>
  );
}

/** Localized text of a {fr, en} object. */
export function useLocalized() {
  const { language } = useSettings();
  return (text: { fr: string; en: string }) => text[language];
}

export function formatDate(epochMs: number, lang: 'fr' | 'en'): string {
  return new Date(epochMs).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Triggers the download of a file built in memory. */
export function downloadBlob(data: BlobPart, fileName: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
