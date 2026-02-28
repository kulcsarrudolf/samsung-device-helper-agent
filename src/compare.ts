import {
  getAllSamsungPhones,
  getAllSamsungTablets,
  getAllSamsungWatches,
  getAllSamsungDevices,
  type LibraryDevice,
} from 'samsung-device-helper';
import type { SamsungDevice, MissingDevicesReport } from './types.js';
import { readOutput, writeOutput } from './utils.js';

const SCRAPE_FILE = process.env.SCRAPE_FILE ?? 'samsung-phones-page-1.json';

function parseReleaseDate(dateString: string | undefined): Date | null {
  if (!dateString) return null;
  try {
    const [month, day, year] = dateString.split('-');
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  } catch {
    return null;
  }
}

function findLatestDevice(devices: LibraryDevice[]): LibraryDevice | null {
  let latest: LibraryDevice | null = null;
  let latestDate: Date | null = null;

  for (const device of devices) {
    const date = parseReleaseDate(device.releaseDate);
    if (date && (!latestDate || date > latestDate)) {
      latestDate = date;
      latest = device;
    }
  }

  return latest;
}

function buildLookupMaps(devices: LibraryDevice[]): {
  byName: Map<string, LibraryDevice>;
  byModel: Map<string, LibraryDevice>;
} {
  const byName = new Map<string, LibraryDevice>();
  const byModel = new Map<string, LibraryDevice>();

  for (const device of devices) {
    const normalized = device.name.toLowerCase().replace(/samsung\s+/i, '');
    byName.set(normalized, device);

    if (Array.isArray(device.models)) {
      for (const model of device.models) {
        byModel.set(model, device);
      }
    }
  }

  return { byName, byModel };
}

function isInLibrary(
  scraped: SamsungDevice,
  byName: Map<string, LibraryDevice>,
  byModel: Map<string, LibraryDevice>,
): LibraryDevice | null {
  const scrapedNorm = scraped.name.toLowerCase().replace(/galaxy\s+/i, '');

  for (const [existingName, device] of byName) {
    if (existingName.includes(scrapedNorm) || scrapedNorm.includes(existingName)) {
      return device;
    }
  }

  for (const model of scraped.models) {
    const found = byModel.get(model);
    if (found) return found;
  }

  return null;
}

async function main(): Promise<void> {
  const existingPhones = getAllSamsungPhones();
  const existingTablets = getAllSamsungTablets();
  const existingWatches = getAllSamsungWatches();
  const allDevices = getAllSamsungDevices();

  console.log(`Phones in library:  ${existingPhones.length}`);
  console.log(`Tablets in library: ${existingTablets.length}`);
  console.log(`Watches in library: ${existingWatches.length}`);
  console.log(`Total in library:   ${allDevices.length}`);

  const latestDevice = findLatestDevice(allDevices);
  if (latestDevice) {
    console.log(`\nLatest in library: ${latestDevice.name} (${latestDevice.releaseDate})`);
  }

  console.log(`\nLoading scraped data from ${SCRAPE_FILE}...`);
  const scrapedData = readOutput<SamsungDevice[]>(SCRAPE_FILE);
  console.log(`Scraped devices: ${scrapedData.length}`);

  const { byName, byModel } = buildLookupMaps(allDevices);
  const missing: SamsungDevice[] = [];

  console.log('\nComparing...');
  for (const device of scrapedData) {
    const match = isInLibrary(device, byName, byModel);
    if (match) {
      console.log(`  ✓ ${device.name} → ${match.name}`);
    } else {
      console.log(`  ✗ ${device.name} (missing)`);
      missing.push(device);
    }
  }

  console.log(`\nMissing: ${missing.length} of ${scrapedData.length} scraped devices`);

  const report: MissingDevicesReport = {
    generatedAt: new Date().toISOString(),
    latestDeviceInLibrary: latestDevice?.releaseDate
      ? { name: latestDevice.name, releaseDate: latestDevice.releaseDate }
      : null,
    totalDevicesInLibrary: allDevices.length,
    totalMissingDevices: missing.length,
    missingDevices: [...missing].reverse(),
  };

  writeOutput('missing-samsung-models.json', report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
