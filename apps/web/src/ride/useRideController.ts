// Runs a ride in the browser: simulation clock, devices, trainer commands,
// incremental saving, wake lock and keyboard actions.

import type { TrainerCommand } from '@hrt/drivetrain';
import { presetById } from '@hrt/drivetrain';
import { DEFAULT_RIDER_PARAMS } from '@hrt/physics';
import { type RideHeader, RideSaver } from '@hrt/recorder';
import type { Route } from '@hrt/route-engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FixedStepLoop } from '../sim/fixed-step-loop';
import { deviceHub, type Role } from '../store/devices';
import { rideStore } from '../store/rides';
import { CDA_BY_BIKE, getSettings } from '../store/settings';
import { ActionDispatcher } from './actions';
import { type ReadingSource, type RideEvent, RideSession } from './ride-session';

export const APP_VERSION = '0.1.0-dev';
const SAVE_INTERVAL_MS = 10_000;

export interface RideGoal {
  kind: 'duration' | 'distance' | 'laps';
  value: number;
}

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'warn';
}

const SOURCE_OF_ROLE: Record<Role, ReadingSource> = {
  trainer: 'trainer',
  powermeter: 'powermeter',
  heartrate: 'heartrate',
};

/**
 * Sends trainer commands one at a time: if one is still being written, only
 * the latest pending command is kept (no queue building up).
 */
function commandSender() {
  let inFlight = false;
  let pending: TrainerCommand | null = null;
  const send = (cmd: TrainerCommand) => {
    const trainer = deviceHub.controllableTrainer;
    if (!trainer) return;
    if (inFlight) {
      pending = cmd;
      return;
    }
    inFlight = true;
    trainer
      .setSimulation({ gradePercent: cmd.gradePercent })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
        const next = pending;
        pending = null;
        if (next) send(next);
      });
  };
  return send;
}

export function useRideController(route: Route, worldId: string, goal: RideGoal | null) {
  const dispatcher = useMemo(() => new ActionDispatcher(), []);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const [finished, setFinished] = useState<RideHeader | null>(null);

  const { session, loop } = useMemo(() => {
    const s = getSettings();
    const p = s.profile;
    const session = new RideSession({
      route,
      rider: {
        ...DEFAULT_RIDER_PARAMS,
        massKg: p.weightKg,
        bikeMassKg: p.bikeMassKg,
        cda: CDA_BY_BIKE[p.bikeType],
        ftpW: p.ftpW,
      },
      drivetrain: s.virtualShifting ? presetById(s.drivetrainPreset).config : null,
      difficulty: s.difficulty,
      powerSource: s.powerSource,
      ride: {
        id: crypto.randomUUID(),
        route: { id: route.id, name: route.meta.name, lengthM: route.lengthM, loop: route.loop },
        worldId,
        rider: { weightKg: p.weightKg, ftpW: p.ftpW },
        appVersion: APP_VERSION,
        goal,
      },
    });
    const send = commandSender();
    const loop = new FixedStepLoop((dt) => {
      const { command } = session.step(dt);
      if (command) send(command);
    });
    return { session, loop };
  }, [route, worldId, goal]);

  const pushToast = useRef((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }).current;

  useEffect(() => {
    // A ride always has a power source: fall back to the simulated trainer.
    if (!deviceHub.hasPowerSource) void deviceHub.connectSimulated('trainer');
    const offReading = deviceHub.onReading((role, r) => session.onReading(SOURCE_OF_ROLE[role], r));
    const saver = new RideSaver(rideStore, session.recorder.header.id);
    let saving = false;
    const save = () => {
      if (saving) return;
      saving = true;
      void saver
        .flush(session.recorder.header, session.recorder.samples)
        .catch((err) => console.error('Ride save failed', err))
        .finally(() => {
          saving = false;
        });
    };
    const saveTimer = setInterval(save, SAVE_INTERVAL_MS);
    // Last chance when the tab is closed or hidden.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    document.addEventListener('visibilitychange', onHide);

    let wakeLock: WakeLockSentinel | null = null;
    void navigator.wakeLock
      ?.request('screen')
      .then((l) => {
        wakeLock = l;
      })
      .catch(() => undefined);

    loop.start();
    return () => {
      loop.stop();
      offReading();
      clearInterval(saveTimer);
      document.removeEventListener('visibilitychange', onHide);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [session, loop]);

  useEffect(() => {
    const offs = [
      dispatcher.on('pause', () => session.togglePause()),
      dispatcher.on('shiftUp', () => session.shift(1)),
      dispatcher.on('shiftDown', () => session.shift(-1)),
      dispatcher.on('lap', () => session.manualLap()),
      dispatcher.on('simPowerUp', () => deviceHub.simulatedTrainer?.adjustRiderPower(1)),
      dispatcher.on('simPowerDown', () => deviceHub.simulatedTrainer?.adjustRiderPower(-1)),
      dispatcher.on('fullscreen', () => {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => undefined);
      }),
    ];
    const offKeys = dispatcher.bindKeyboard(window);
    return () => {
      for (const off of offs) off();
      offKeys();
    };
  }, [dispatcher, session]);

  const onEvent = useRef<(e: RideEvent) => void>(() => undefined);
  useEffect(() => session.on((e) => onEvent.current(e)), [session]);

  /** Ends the ride, saves it and returns its header. */
  const finish = async (): Promise<RideHeader> => {
    loop.stop();
    const header = session.finish();
    await new RideSaver(rideStore, header.id).flush(header, session.recorder.samples);
    setFinished(header);
    return header;
  };

  /** Stops without keeping anything. */
  const discard = async () => {
    loop.stop();
    await rideStore.deleteRide(session.recorder.header.id);
  };

  return { session, loop, dispatcher, toasts, pushToast, onEvent, finish, discard, finished };
}
