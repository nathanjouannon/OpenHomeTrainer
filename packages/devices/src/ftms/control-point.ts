import { clamp } from '@hrt/shared';
import { ByteReader } from '../bytes';

export const OpCode = {
  requestControl: 0x00,
  reset: 0x01,
  setTargetResistanceLevel: 0x04,
  setTargetPower: 0x05,
  startOrResume: 0x07,
  stopOrPause: 0x08,
  setIndoorBikeSimulation: 0x11,
  responseCode: 0x80,
} as const;

export const ResultCode = {
  success: 0x01,
  opCodeNotSupported: 0x02,
  invalidParameter: 0x03,
  operationFailed: 0x04,
  controlNotPermitted: 0x05,
} as const;

const RESULT_NAMES: Record<number, string> = {
  [ResultCode.success]: 'success',
  [ResultCode.opCodeNotSupported]: 'op code not supported',
  [ResultCode.invalidParameter]: 'invalid parameter',
  [ResultCode.operationFailed]: 'operation failed',
  [ResultCode.controlNotPermitted]: 'control not permitted',
};

const OP_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(OpCode).map(([name, code]) => [code, name]),
);

export const opCodeName = (op: number): string =>
  OP_NAMES[op] ?? `0x${op.toString(16).padStart(2, '0')}`;

const frame = (...bytes: number[]): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);
const le16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const toSint16 = (v: number) => Math.round(clamp(v, -32768, 32767));

export const encodeRequestControl = () => frame(OpCode.requestControl);
export const encodeReset = () => frame(OpCode.reset);
export const encodeStartOrResume = () => frame(OpCode.startOrResume);
export const encodeStopOrPause = (mode: 'stop' | 'pause') =>
  frame(OpCode.stopOrPause, mode === 'stop' ? 1 : 2);

/** Target power in W (sint16). */
export const encodeSetTargetPower = (watts: number) =>
  frame(OpCode.setTargetPower, ...le16(toSint16(watts)));

/** Resistance level, uint8 with 0.1 resolution (FTMS 1.0). */
export const encodeSetTargetResistanceLevel = (level: number) =>
  frame(OpCode.setTargetResistanceLevel, Math.round(clamp(level, 0, 25.5) * 10));

export interface IndoorBikeSimulation {
  gradePercent: number;
  windSpeedMs?: number;
  /** Neutral defaults: the app physics computes the speed, not the trainer. */
  crr?: number;
  cwKgM?: number;
}

/**
 * Set Indoor Bike Simulation Parameters (0x11):
 * wind sint16 (0.001 m/s), grade sint16 (0.01 %), crr uint8 (0.0001), cw uint8 (0.01 kg/m).
 */
export function encodeSetIndoorBikeSimulation(p: IndoorBikeSimulation): Uint8Array<ArrayBuffer> {
  const wind = toSint16((p.windSpeedMs ?? 0) * 1000);
  const grade = toSint16(p.gradePercent * 100);
  const crr = Math.round(clamp((p.crr ?? 0.004) * 10000, 0, 255));
  const cw = Math.round(clamp((p.cwKgM ?? 0.51) * 100, 0, 255));
  return frame(OpCode.setIndoorBikeSimulation, ...le16(wind), ...le16(grade), crr, cw);
}

export interface ControlPointResponse {
  requestOpCode: number;
  resultCode: number;
  ok: boolean;
  description: string;
}

/** Control point indication: [0x80, request op code, result code, ...]. */
export function parseControlPointResponse(view: DataView): ControlPointResponse | null {
  const r = new ByteReader(view);
  if (r.uint8() !== OpCode.responseCode) return null;
  const requestOpCode = r.uint8();
  const resultCode = r.uint8();
  return {
    requestOpCode,
    resultCode,
    ok: resultCode === ResultCode.success,
    description: `${opCodeName(requestOpCode)}: ${RESULT_NAMES[resultCode] ?? `result 0x${resultCode.toString(16)}`}`,
  };
}
