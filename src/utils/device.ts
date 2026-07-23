import type { NewDevice } from '../types.js';
import { EXPORT_CONST_NAME } from '../config.js';

// These templates intentionally emit compact, valid, single-quoted TypeScript.
// Prettier (via formatForTarget, using the target repo's own config) owns the final
// layout: wrapping, spacing, and trailing commas. We keep no hand-built layout here.
export function formatDevice(d: NewDevice): string {
  const models = d.models.map((m) => `'${m}'`).join(', ');
  return `  {
    name: '${d.name}',
    releaseDate: '${d.releaseDate}',
    type: '${d.type}',
    models: [${models}],
  }`;
}

export function appendToFile(content: string, devices: NewDevice[]): string {
  const entries = devices.map(formatDevice).join(',\n');
  const idx = content.lastIndexOf('];');
  if (idx === -1) throw new Error('Could not find closing `];` in file (check file format)');
  const before = content.slice(0, idx).trimEnd();
  const after = content.slice(idx);
  const separator = before.endsWith(',') ? '' : ',';
  return `${before}${separator}\n${entries}\n${after}`;
}

export function buildNewFile(devices: NewDevice[]): string {
  return `import { Device } from '../types';

export const ${EXPORT_CONST_NAME}: Device[] = [
${devices.map(formatDevice).join(',\n')}
];
`;
}
