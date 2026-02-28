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

  const report: MissingDevicesReport = {
    generatedAt: new Date().toISOString(),
    latestDeviceInLibrary: latestDevice?.releaseDate
      ? { name: latestDevice.name, releaseDate: latestDevice.releaseDate }
      : null,
    totalDevicesInLibrary: allDevices.length,
    totalMissingDevices: 0,
    missingDevices: [],
  };

  writeOutput('missing-samsung-models.json', report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
