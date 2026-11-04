import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './prompts.js';

const CANDIDATES = [
  { name: 'Galaxy F70', url: 'https://www.gsmarena.com/samsung_galaxy_f70_5g-15014.php' },
  { name: 'Galaxy Tab S12+', url: 'https://www.gsmarena.com/samsung_galaxy_tab_s12+_5g-14981.php' },
];

describe('buildSystemPrompt', () => {
  it('lists every candidate device with its spec page URL', () => {
    const prompt = buildSystemPrompt(CANDIDATES);
    expect(prompt).toContain(
      '1. Galaxy F70: https://www.gsmarena.com/samsung_galaxy_f70_5g-15014.php',
    );
    expect(prompt).toContain(
      '2. Galaxy Tab S12+: https://www.gsmarena.com/samsung_galaxy_tab_s12+_5g-14981.php',
    );
  });

  it('keeps the extraction rules and forbids revisiting the listing', () => {
    const prompt = buildSystemPrompt(CANDIDATES);
    expect(prompt).toContain('MM-DD-YYYY');
    expect(prompt).toContain('remove "Samsung " prefix');
    expect(prompt).toContain('Do NOT navigate to the listing page');
    expect(prompt).not.toContain('EARLY EXIT CHECK');
  });
});
