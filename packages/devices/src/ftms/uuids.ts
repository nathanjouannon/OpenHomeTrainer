// Bluetooth SIG assigned numbers (16-bit UUIDs).
export const FTMS = {
  service: 0x1826,
  feature: 0x2acc,
  indoorBikeData: 0x2ad2,
  trainingStatus: 0x2ad3,
  supportedResistanceLevelRange: 0x2ad6,
  supportedPowerRange: 0x2ad8,
  controlPoint: 0x2ad9,
  status: 0x2ada,
} as const;

export const CPS = { service: 0x1818, measurement: 0x2a63, feature: 0x2a65 } as const;
export const HRS = { service: 0x180d, measurement: 0x2a37 } as const;
export const CSCS = { service: 0x1816, measurement: 0x2a5b } as const;
