import fs from 'fs';

const EXAMPLE = '.env.example';
const TARGET = '.env';

// Matches an assignment line, whether active (FOO=...) or commented (# FOO=...),
// capturing the variable name.
const KEY_REGEX = /^\s*#?\s*([A-Z_][A-Z0-9_]*)=/;

function keyOf(line: string): string | null {
  const match = line.match(KEY_REGEX);
  return match?.[1] ?? null;
}

if (!fs.existsSync(EXAMPLE)) {
  console.error(`${EXAMPLE} not found. Cannot initialize ${TARGET}.`);
  process.exit(1);
}

// No .env yet: copy the template verbatim.
if (!fs.existsSync(TARGET)) {
  fs.copyFileSync(EXAMPLE, TARGET);
  console.log(`${TARGET} created. Replace the placeholder values with your actual tokens.`);
  process.exit(0);
}

// .env exists: append any keys present in the template but missing here,
// preserving existing values and each entry's active/commented status.
const exampleLines = fs.readFileSync(EXAMPLE, 'utf8').split('\n');
const existing = fs.readFileSync(TARGET, 'utf8');
const existingKeys = new Set(
  existing
    .split('\n')
    .map(keyOf)
    .filter((key): key is string => key !== null),
);

const missingLines = exampleLines.filter((line) => {
  const key = keyOf(line);
  return key !== null && !existingKeys.has(key);
});

if (missingLines.length === 0) {
  console.log(`${TARGET} already has every key from ${EXAMPLE}. No changes made.`);
  process.exit(0);
}

const addedKeys = missingLines.map((line) => keyOf(line));
const leadingNewline = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
const block = `${leadingNewline}\n# Added by \`yarn init:env\` (new keys from ${EXAMPLE})\n${missingLines.join('\n')}\n`;
fs.appendFileSync(TARGET, block);

console.log(`${TARGET} updated. Added ${addedKeys.length} new key(s): ${addedKeys.join(', ')}`);
console.log('Fill in any required values before running the agent.');
