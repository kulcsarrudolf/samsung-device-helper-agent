import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './prompts.js';

describe('buildSystemPrompt', () => {
  it('uses the device limit in the early-exit check and scraping steps', () => {
    const prompt = buildSystemPrompt(new Set(['galaxy s26']), 'galaxy s26', 7);
    expect(prompt).toContain('Read the first 7 devices listed');
    expect(prompt).toContain('If ALL of the first 7 devices');
    expect(prompt).toContain('READ the first 7 devices');
    expect(prompt).not.toContain('first 10 devices');
  });

  it('omits the early-exit check when there are no known names', () => {
    const prompt = buildSystemPrompt(new Set(), null, 5);
    expect(prompt).not.toContain('EARLY EXIT CHECK');
    expect(prompt).toContain('READ the first 5 devices');
  });
});
