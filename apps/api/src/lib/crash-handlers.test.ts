import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { captureLogs } from '../testing/log-capture.js';
import { installCrashHandlers } from './crash-handlers.js';

const SECRET = 'synthetic transcript: chest pain since Tuesday';

function setup() {
  const logs = captureLogs();
  const fakeProcess = new EventEmitter();
  const exit = vi.fn();
  installCrashHandlers(logs.logger, fakeProcess as unknown as NodeJS.Process, exit);
  return { logs, fakeProcess, exit };
}

describe('crash handlers', () => {
  it('logs an unhandled rejection through the redacting logger, then exits', () => {
    const { logs, fakeProcess, exit } = setup();

    fakeProcess.emit('unhandledRejection', new Error(`Value: ${SECRET}`));

    expect(logs.entries()).toEqual([
      expect.objectContaining({ level: 'fatal', msg: 'unhandled promise rejection' }),
    ]);
    expect(logs.raw()).not.toContain(SECRET);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('logs an uncaught exception the same way', () => {
    const { logs, fakeProcess, exit } = setup();

    fakeProcess.emit('uncaughtException', new Error(`Value: ${SECRET}`));

    expect(logs.entries()).toEqual([
      expect.objectContaining({ level: 'fatal', msg: 'uncaught exception' }),
    ]);
    expect(logs.raw()).not.toContain(SECRET);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
