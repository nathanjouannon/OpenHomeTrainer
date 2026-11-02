import {
  BleLog,
  type BleLogEntry,
  type ControllableTrainer,
  DeviceError,
  type DeviceStatus,
  FtmsTrainer,
  type SensorReading,
  SimulatedTrainer,
} from '@hrt/devices';
import { useCallback, useEffect, useRef, useState } from 'react';

const GRADE_PRESETS = [0, 5, 10, -5];
const LOG_ROWS = 200;
const UI_REFRESH_MS = 250;

const bluetoothAvailable = typeof navigator !== 'undefined' && 'bluetooth' in navigator;

export function BleSpikePage() {
  const logRef = useRef(new BleLog());
  const [trainer, setTrainer] = useState<ControllableTrainer | null>(null);
  const [status, setStatus] = useState<DeviceStatus>('disconnected');
  const [reading, setReading] = useState<SensorReading | null>(null);
  const [entries, setEntries] = useState<readonly BleLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customGrade, setCustomGrade] = useState(3);
  const [ergWatts, setErgWatts] = useState(150);
  const [simPower, setSimPower] = useState<number | null>(null);

  // Refresh the log view at a low rate rather than on every frame.
  useEffect(() => {
    const id = setInterval(
      () => setEntries([...logRef.current.all().slice(-LOG_ROWS)]),
      UI_REFRESH_MS,
    );
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!trainer) {
      setStatus('disconnected');
      return;
    }
    // The device may already have changed status before this effect subscribed.
    setStatus(trainer.status);
    let latest: SensorReading | null = null;
    const offReading = trainer.onReading((r) => {
      latest = r;
    });
    const offStatus = trainer.onStatus(setStatus);
    const id = setInterval(() => {
      if (latest) setReading(latest);
      if (trainer instanceof SimulatedTrainer) setSimPower(trainer.targetPowerW);
    }, UI_REFRESH_MS);
    return () => {
      offReading();
      offStatus();
      clearInterval(id);
    };
  }, [trainer]);

  // Simulated trainer: ↑ / ↓ change the rider's power by 10 W.
  useEffect(() => {
    if (!(trainer instanceof SimulatedTrainer)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowUp') trainer.adjustRiderPower(+1);
      else if (e.key === 'ArrowDown') trainer.adjustRiderPower(-1);
      else return;
      e.preventDefault();
      setSimPower(trainer.targetPowerW);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [trainer]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof DeviceError ? `${err.code} — ${err.message}` : String(err));
    }
  }, []);

  const connectReal = () =>
    run(async () => {
      await trainer?.disconnect();
      const t = await FtmsTrainer.request(logRef.current);
      setTrainer(t);
      await t.connect();
    });

  const connectSimulated = () =>
    run(async () => {
      await trainer?.disconnect();
      const t = new SimulatedTrainer({ log: logRef.current });
      setTrainer(t);
      await t.connect();
    });

  const disconnect = () =>
    run(async () => {
      await trainer?.disconnect();
      setTrainer(null);
      setReading(null);
    });

  const sendGrade = (gradePercent: number) =>
    run(async () => trainer?.setSimulation({ gradePercent }));
  const sendErg = () => run(async () => trainer?.setTargetPower(ergWatts));

  const exportLog = () => {
    const meta = {
      device: trainer?.name ?? null,
      info: trainer instanceof FtmsTrainer ? serializeInfo(trainer) : null,
      userAgent: navigator.userAgent,
    };
    const blob = new Blob([logRef.current.toJSON(meta)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ble-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const connected = status === 'connected';

  return (
    <main className="page">
      <a href="#/">← Accueil</a>
      <h1>Spike Bluetooth (FTMS)</h1>
      {!bluetoothAvailable && (
        <p className="warning">
          Web Bluetooth n'est pas disponible dans ce navigateur. Utilise Chrome ou Edge sur
          ordinateur (sur macOS, autorise Chrome dans Réglages Système › Confidentialité ›
          Bluetooth). Le trainer simulé reste utilisable.
        </p>
      )}

      <section className="row">
        <button type="button" onClick={connectReal} disabled={!bluetoothAvailable}>
          Connecter un trainer FTMS
        </button>
        <button type="button" onClick={connectSimulated}>
          Utiliser le trainer simulé
        </button>
        <button type="button" onClick={disconnect} disabled={!trainer}>
          Déconnecter
        </button>
        <span className={`status status-${status}`}>
          {trainer ? `${trainer.name} — ${status}` : 'Aucun appareil'}
        </span>
      </section>
      {error && <p className="error">{error}</p>}

      <section className="metrics">
        <Metric label="Puissance" value={reading?.powerW} unit="W" />
        <Metric label="Cadence" value={reading?.cadenceRpm} unit="rpm" />
        <Metric label="Vitesse trainer" value={reading?.speedKmh?.toFixed(1)} unit="km/h" />
        <Metric label="FC" value={reading?.heartRateBpm} unit="bpm" />
      </section>
      {trainer instanceof SimulatedTrainer && (
        <p className="muted">
          Trainer simulé : puissance du coureur {simPower ?? trainer.targetPowerW} W (flèches ↑ / ↓,
          pas de 10 W).
        </p>
      )}
      {trainer instanceof FtmsTrainer && <TrainerInfo trainer={trainer} />}

      <section>
        <h2>Mode SIM (pente)</h2>
        <p className="muted">
          Critère de sortie : la résistance doit changer nettement entre 0 %, 5 % et 10 %.
        </p>
        <div className="row">
          {GRADE_PRESETS.map((g) => (
            <button key={g} type="button" disabled={!connected} onClick={() => sendGrade(g)}>
              {g} %
            </button>
          ))}
          <input
            type="number"
            step={0.5}
            min={-20}
            max={20}
            value={customGrade}
            onChange={(e) => setCustomGrade(Number(e.target.value))}
          />
          <button type="button" disabled={!connected} onClick={() => sendGrade(customGrade)}>
            Envoyer la pente
          </button>
        </div>
      </section>

      <section>
        <h2>Mode ERG (puissance cible)</h2>
        <div className="row">
          <input
            type="number"
            step={10}
            min={0}
            max={1000}
            value={ergWatts}
            onChange={(e) => setErgWatts(Number(e.target.value))}
          />
          <button type="button" disabled={!connected} onClick={sendErg}>
            Envoyer {ergWatts} W
          </button>
        </div>
      </section>

      <section>
        <div className="row">
          <h2>Journal des trames</h2>
          <button type="button" onClick={exportLog}>
            Exporter en JSON
          </button>
          <button
            type="button"
            onClick={() => {
              logRef.current.clear();
              setEntries([]);
            }}
          >
            Vider
          </button>
        </div>
        <div className="log">
          <table>
            <thead>
              <tr>
                <th>t (s)</th>
                <th>Sens</th>
                <th>Caractéristique</th>
                <th>Hex</th>
                <th>Décodé</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .reverse()
                .map((e) => (
                  <tr key={e.seq} className={`dir-${e.dir}`}>
                    <td>{(e.t / 1000).toFixed(2)}</td>
                    <td>{e.dir}</td>
                    <td>{e.characteristic ?? ''}</td>
                    <td className="mono">{e.hex ?? ''}</td>
                    <td className="mono">{e.decoded ?? ''}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | string | undefined;
  unit: string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">
        {value ?? '—'} <small>{unit}</small>
      </span>
    </div>
  );
}

function serializeInfo(trainer: FtmsTrainer) {
  const { features, powerRange, resistanceRange } = trainer.info;
  return {
    machineFeatures: features ? [...features.machine] : null,
    targetSettings: features ? [...features.targetSettings] : null,
    powerRange: powerRange ?? null,
    resistanceRange: resistanceRange ?? null,
    capabilities: [...trainer.capabilities],
  };
}

function TrainerInfo({ trainer }: { trainer: FtmsTrainer }) {
  const info = serializeInfo(trainer);
  return (
    <details>
      <summary>Capacités annoncées par le trainer</summary>
      <pre className="mono">{JSON.stringify(info, null, 2)}</pre>
    </details>
  );
}
