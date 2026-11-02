import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from '../bytes';
import {
  encodeRequestControl,
  encodeSetIndoorBikeSimulation,
  encodeSetTargetPower,
  encodeSetTargetResistanceLevel,
  encodeStopOrPause,
  parseControlPointResponse,
} from './control-point';
import { parseFitnessMachineFeature, parseSupportedPowerRange } from './feature';
import { parseIndoorBikeData } from './indoor-bike-data';
import { describeFitnessMachineStatus } from './status';

describe('parseIndoorBikeData', () => {
  it('reads speed (inverted bit 0), cadence and power', () => {
    // flags 0x0044: speed present (bit0 = 0), cadence (bit2), power (bit6)
    // speed 3245 (32.45 km/h), cadence 180 (90 rpm), power 250 W
    const d = parseIndoorBikeData(fromHex('44 00 ad 0c b4 00 fa 00'));
    expect(d).toEqual({ speedKmh: 32.45, cadenceRpm: 90, powerW: 250 });
  });

  it('omits the speed when the More Data bit is set', () => {
    // flags 0x0041: more data, power only
    expect(parseIndoorBikeData(fromHex('41 00 2c 01'))).toEqual({ powerW: 300 });
  });

  it('walks every optional field in order', () => {
    // flags 0x1fff: all fields; bit 0 set (More Data) so no instant speed
    const frame = fromHex(
      [
        'ff 1f',
        'e8 03', // avg speed 10.00
        'b0 00', // cadence 88
        'a0 00', // avg cadence 80
        '10 27 00', // distance 10000 m
        '05 00', // resistance 5
        'c8 00', // power 200
        'be 00', // avg power 190
        '64 00 58 02 0a', // energy 100 kcal, 600/h, 10/min
        '8c', // HR 140
        '45', // MET 6.9
        '3c 00', // elapsed 60 s
        '1e 00', // remaining 30 s
      ].join(' '),
    );
    expect(parseIndoorBikeData(frame)).toEqual({
      averageSpeedKmh: 10,
      cadenceRpm: 88,
      averageCadenceRpm: 80,
      totalDistanceM: 10000,
      resistanceLevel: 5,
      powerW: 200,
      averagePowerW: 190,
      totalEnergyKcal: 100,
      energyPerHourKcal: 600,
      energyPerMinuteKcal: 10,
      heartRateBpm: 140,
      metabolicEquivalent: 6.9,
      elapsedTimeS: 60,
      remainingTimeS: 30,
    });
  });

  it('handles negative power', () => {
    expect(parseIndoorBikeData(fromHex('41 00 f6 ff')).powerW).toBe(-10);
  });

  it('throws on truncated frames', () => {
    expect(() => parseIndoorBikeData(fromHex('44 00 ad 0c'))).toThrow(RangeError);
  });
});

describe('control point encoders', () => {
  it('encodes the documented 5.25 % grade example', () => {
    expect(toHex(encodeSetIndoorBikeSimulation({ gradePercent: 5.25 }))).toBe(
      '11 00 00 0d 02 28 33',
    );
  });

  it('encodes negative grades and wind', () => {
    // wind -1.5 m/s = -1500 = 0xfa24, grade -3 % = -300 = 0xfed4
    expect(toHex(encodeSetIndoorBikeSimulation({ gradePercent: -3, windSpeedMs: -1.5 }))).toBe(
      '11 24 fa d4 fe 28 33',
    );
  });

  it('clamps out-of-range values instead of overflowing', () => {
    expect(toHex(encodeSetIndoorBikeSimulation({ gradePercent: 400, crr: 1, cwKgM: 10 }))).toBe(
      '11 00 00 ff 7f ff ff',
    );
  });

  it('encodes the other commands', () => {
    expect(toHex(encodeRequestControl())).toBe('00');
    expect(toHex(encodeSetTargetPower(250))).toBe('05 fa 00');
    expect(toHex(encodeSetTargetResistanceLevel(4.5))).toBe('04 2d');
    expect(toHex(encodeStopOrPause('pause'))).toBe('08 02');
  });
});

describe('control point responses', () => {
  it('parses a success response', () => {
    expect(parseControlPointResponse(fromHex('80 11 01'))).toMatchObject({
      requestOpCode: 0x11,
      ok: true,
      description: 'setIndoorBikeSimulation: success',
    });
  });

  it('parses a refusal', () => {
    expect(parseControlPointResponse(fromHex('80 05 05'))).toMatchObject({
      ok: false,
      description: 'setTargetPower: control not permitted',
    });
  });

  it('ignores frames that are not responses', () => {
    expect(parseControlPointResponse(fromHex('11 00'))).toBeNull();
  });
});

describe('feature and ranges', () => {
  it('decodes target setting features', () => {
    // machine: cadence (bit1) + power (bit14) = 0x4002; targets: power (bit3) + sim (bit13) = 0x2008
    const f = parseFitnessMachineFeature(fromHex('02 40 00 00 08 20 00 00'));
    expect([...f.machine]).toEqual(['cadence', 'powerMeasurement']);
    expect([...f.targetSettings]).toEqual(['powerTarget', 'indoorBikeSimulation']);
  });

  it('decodes the supported power range', () => {
    expect(parseSupportedPowerRange(fromHex('00 00 d0 07 01 00'))).toEqual({
      min: 0,
      max: 2000,
      increment: 1,
    });
  });

  it('describes machine status changes', () => {
    expect(describeFitnessMachineStatus(fromHex('12 00 00 f4 01'))).toBe(
      'indoor bike simulation parameters changed: grade 5 %, wind 0 m/s',
    );
  });
});
