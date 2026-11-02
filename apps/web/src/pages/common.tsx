import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';

export function Page({
  title,
  children,
  back = '#/',
}: {
  title: string;
  children: ReactNode;
  back?: string | null;
}) {
  const t = useT();
  return (
    <main className="page">
      <header className="page-header">
        {back !== null && (
          <a className="back" href={back}>
            ← {t('nav.back')}
          </a>
        )}
        <h1>{title}</h1>
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
