/**
 * Serializes GATT operations: Web Bluetooth rejects concurrent ones with
 * "GATT operation already in progress".
 */
export class GattQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(op: () => Promise<T>): Promise<T> {
    const result = this.tail.then(op, op);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
