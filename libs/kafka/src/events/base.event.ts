export class BaseEvent<T = any> {
  constructor(public readonly type: string, public readonly payload: T) {}

  toString() {
    return JSON.stringify({
      type: this.type,
      payload: this.payload,
      timestamp: new Date().toISOString(),
    });
  }
}
