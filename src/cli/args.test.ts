import { describe, expect, it } from 'vitest';
import { parseDeviceLimit } from './args.js';

describe('parseDeviceLimit', () => {
  it('returns undefined when no positional arg is given', () => {
    expect(parseDeviceLimit([])).toBeUndefined();
    expect(parseDeviceLimit(['--dry-run'])).toBeUndefined();
  });

  it('parses a positive integer regardless of flag position', () => {
    expect(parseDeviceLimit(['5'])).toBe(5);
    expect(parseDeviceLimit(['--dry-run', '3'])).toBe(3);
    expect(parseDeviceLimit(['3', '--dry-run'])).toBe(3);
  });

  it('rejects non-integers and non-positive values', () => {
    for (const bad of ['abc', '0', '-2', '2.5', '']) {
      expect(() => parseDeviceLimit([bad])).toThrow('Invalid device limit');
    }
  });
});
