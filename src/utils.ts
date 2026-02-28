import fs from 'fs';
import path from 'path';

export const OUTPUT_DIR = '.output';

const MONTH_MAP: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

export function parseDate(dateString: string): string | null {
  const match = dateString.match(/(\d{4}),\s(\w+)\s(\d{1,2})/);
  if (!match) return null;

  const [, year, monthName, day] = match;
  const month = MONTH_MAP[monthName];
  if (!month) return null;

  return `${month}-${day.padStart(2, '0')}-${year}`;
}

export function ensureOutputDir(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

export function writeOutput(filename: string, data: unknown): void {
  ensureOutputDir();
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Saved → ${filePath}`);
}

export function readOutput<T>(filename: string): T {
  const filePath = path.join(OUTPUT_DIR, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}
