import type { ControlAction } from './actions';

export type InputSource = 'keyboard' | 'gamepad' | 'obc' | 'remote';

/** What a source tells the hub. Sources only produce press and release. */
export type InputEventType = 'press' | 'release';

export interface InputEvent {
  source: InputSource;
  /** One physical device ('keyboard', a gamepad id, a Bluetooth device id). */
  deviceId: string;
  /** Stable name of the control: `key:a`, `button:5`, `button:0x01`… */
  control: string;
  type: InputEventType;
  /** Analog value when the control has one (OpenBikeControl 0x02–0xFF). */
  value?: number;
  /** Auto-repeat of a held key sent by the operating system. */
  repeated?: boolean;
}

export type BindingType = 'press' | 'long_press' | 'double_press';

export interface Binding {
  source: InputSource;
  control: string;
  type: BindingType;
  action: ControlAction;
  /** Repeat the action every `repeatMs` while the control stays pressed. */
  repeatMs?: number;
}

export interface Profile {
  id: string;
  name: string;
  bindings: Binding[];
}

export type ActionSource = InputSource | 'ui' | 'test';
