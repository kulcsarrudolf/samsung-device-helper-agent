import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { SamsungDevice, ScraperConfig } from './types.js';
import { parseDate, writeOutput } from './utils.js';

const BASE_URL = 'https://www.gsmarena.com';

const config: ScraperConfig = {
  pages: parseInt(process.env.SCRAPER_PAGES ?? '1', 10),
  maxModelsPerPage: parseInt(process.env.SCRAPER_MAX_MODELS ?? '8', 10),
};

async function fetchHtml(url: string): Promise<string> {
  const delay = Math.floor(Math.random() * 2000) + 1000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
  });

  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  const content = await page.content();
  await browser.close();

  return content;
}

async function getModelUrlsFromPage(pageNumber: number): Promise<string[]> {
  const url = `${BASE_URL}/samsung-phones-f-9-0-p${pageNumber}.php`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const urls: string[] = [];
  $('.makers ul li a').each((_i, el) => {
    const href = $(el).attr('href');
    if (href) urls.push(`${BASE_URL}/${href}`);
  });

  return urls;
}

async function getModelDetails(modelUrl: string): Promise<SamsungDevice> {
  try {
    const html = await fetchHtml(modelUrl);
    const $ = cheerio.load(html);

    const statusText = $('.ttl')
      .filter((_i, el) => $(el).text().includes('Status'))
      .next('.nfo')
      .text();

    return {
      name: $('.specs-phone-name-title').text().replace('Samsung ', ''),
      releaseDate: parseDate(statusText),
      models: $('.ttl')
        .filter((_i, el) => $(el).text().includes('Models'))
        .next('.nfo')
        .text()
        .split(',')
        .map((m) => m.trim()),
    };
  } catch {
    console.warn(`Retrying ${modelUrl}...`);
    return getModelDetails(modelUrl);
  }
}

async function main(): Promise<void> {
  const allPhones: SamsungDevice[] = [];

  for (let page = 1; page <= config.pages; page++) {
    console.log(`\nFetching model URLs from page ${page}...`);

    const modelUrls = await getModelUrlsFromPage(page);
    const limit = Math.min(config.maxModelsPerPage, modelUrls.length);

    console.log(`Scraping ${limit} of ${modelUrls.length} models`);

    const pagePhones: SamsungDevice[] = [];
    for (let i = 0; i < limit; i++) {
      const device = await getModelDetails(modelUrls[i]);
      pagePhones.push(device);
      console.log(`  [${i + 1}/${limit}] ${device.name}`);
    }

    allPhones.push(...pagePhones);
    writeOutput(`samsung-phones-page-${page}.json`, pagePhones);
  }

  const timestamp = Math.floor(Date.now() / 1000);
  writeOutput(`samsung-phones-${timestamp}.json`, [...allPhones].reverse());

  console.log(`\nDone. Total: ${allPhones.length} models scraped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
