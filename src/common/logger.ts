export class Logger {
  private prefix: string;
  public readonly enabled: boolean;

  constructor(options: { enabled?: boolean; prefix?: string }) {
    this.enabled = options.enabled || false;
    this.prefix = options.prefix || '[LensService]';
  }

  debug(...args: unknown[]) {
    if (this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  error(...args: unknown[]) {
    // Errors are always logged for visibility.
    console.error(this.prefix, '[ERROR]', ...args);
  }

  time(label: string) {
    if (this.enabled) {
      console.time(label);
    }
  }

  timeEnd(label: string) {
    if (this.enabled) {
      console.timeEnd(label);
    }
  }
}
