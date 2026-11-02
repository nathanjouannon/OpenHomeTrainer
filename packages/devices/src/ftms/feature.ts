import { ByteReader } from '../bytes';

const MACHINE_FEATURES = [
  'averageSpeed',
  'cadence',
  'totalDistance',
  'inclination',
  'elevationGain',
  'pace',
  'stepCount',
  'resistanceLevel',
  'strideCount',
  'expendedEnergy',
  'heartRate',
  'metabolicEquivalent',
  'elapsedTime',
  'remainingTime',
  'powerMeasurement',
  'forceOnBeltAndPowerOutput',
  'userDataRetention',
] as const;

const TARGET_SETTING_FEATURES = [
  'speedTarget',
  'inclinationTarget',
  'resistanceTarget',
  'powerTarget',
  'heartRateTarget',
  'targetedExpendedEnergy',
  'targetedStepNumber',
  'targetedStrideNumber',
  'targetedDistance',
  'targetedTrainingTime',
  'targetedTimeInTwoHeartRateZones',
  'targetedTimeInThreeHeartRateZones',
  'targetedTimeInFiveHeartRateZones',
  'indoorBikeSimulation',
  'wheelCircumference',
  'spinDownControl',
  'targetedCadence',
] as const;

export type MachineFeature = (typeof MACHINE_FEATURES)[number];
export type TargetSettingFeature = (typeof TARGET_SETTING_FEATURES)[number];

export interface FitnessMachineFeatures {
  machine: Set<MachineFeature>;
  targetSettings: Set<TargetSettingFeature>;
}

const decodeBits = <T extends string>(value: number, names: readonly T[]): Set<T> =>
  new Set(names.filter((_, i) => (value & (1 << i)) !== 0));

/** Fitness Machine Feature (0x2ACC): two uint32 bit fields. */
export function parseFitnessMachineFeature(view: DataView): FitnessMachineFeatures {
  const r = new ByteReader(view);
  const machine = r.uint32();
  const targets = r.remaining >= 4 ? r.uint32() : 0;
  return {
    machine: decodeBits(machine, MACHINE_FEATURES),
    targetSettings: decodeBits(targets, TARGET_SETTING_FEATURES),
  };
}

export interface SupportedRange {
  min: number;
  max: number;
  increment: number;
}

/** Supported Power Range (0x2AD8): sint16 min, sint16 max, uint16 increment, in W. */
export function parseSupportedPowerRange(view: DataView): SupportedRange {
  const r = new ByteReader(view);
  return { min: r.sint16(), max: r.sint16(), increment: r.uint16() };
}

/** Supported Resistance Level Range (0x2AD6): sint16 min, sint16 max, uint16 increment, 0.1 resolution. */
export function parseSupportedResistanceRange(view: DataView): SupportedRange {
  const r = new ByteReader(view);
  return { min: r.sint16() / 10, max: r.sint16() / 10, increment: r.uint16() / 10 };
}
