// Dev mode: the free camera's coordinates, in place of the ride HUD.

import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { type CameraPose, type PoseContext, poseReport } from '../world/free-camera';

export function DevCameraPanel({
  pose,
  speedMs,
  context,
}: {
  pose: CameraPose | null;
  speedMs: number;
  context: PoseContext;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!pose) return;
    navigator.clipboard
      ?.writeText(poseReport(pose, context, window.location.href))
      .then(() => setCopied(true))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyP' || e.ctrlKey || e.metaKey || e.altKey) return;
      copy();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const f = (v: number | undefined, d = 1) => (v === undefined ? '—' : v.toFixed(d));
  return (
    <div className="dev-camera" data-testid="dev-camera">
      <div className="dev-camera-title">{t('dev.free.title')}</div>
      <dl>
        <dt>x</dt>
        <dd>{f(pose?.x)} m</dd>
        <dt>y</dt>
        <dd>{f(pose?.y)} m</dd>
        <dt>z</dt>
        <dd>{f(pose?.z)} m</dd>
        <dt>cap</dt>
        <dd>{f(pose?.yawDeg)}°</dd>
        <dt>pitch</dt>
        <dd>{f(pose?.pitchDeg)}°</dd>
        <dt>vitesse</dt>
        <dd>{Math.round(speedMs)} m/s</dd>
      </dl>
      <button type="button" onClick={copy} disabled={!pose}>
        {copied ? t('dev.free.copied') : t('dev.free.copy')}
      </button>
      <p className="muted small">{t('dev.free.help')}</p>
    </div>
  );
}
