const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");

const BASE_URL = "https://www.gsmarena.com";

const writeObjectToFile = (object, fileName, callback) => {
  const data = JSON.stringify(object, null, 2);
  if (callback) {
    fs.writeFile(fileName, data, { flag: "w" }, callback);
  } else {
    try {
      fs.writeFileSync(fileName, data, { flag: "w" });
    } catch (err) {
      console.error(err);
    }
  }
};

const parseDate = (dateString) => {
  const months = {
    January: "01",
    February: "02",
    March: "03",
    April: "04",
    May: "05",
    June: "06",
    July: "07",
    August: "08",
    September: "09",
    October: "10",
    November: "11",
    December: "12",
  };

  const datePattern = /(\d{4}),\s(\w+)\s(\d{1,2})/;
  const match = dateString.match(datePattern);

  if (match) {
    const year = match[1];
    const month = months[match[2]];
    const day = match[3].padStart(2, "0");
    return `${month}-${day}-${year}`;
  }

  return null;
};

const fetchData = async (url) => {
  const wait = Math.floor(Math.random() * 2000) + 1000;
  await new Promise((resolve) => setTimeout(resolve, wait));

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  const content = await page.content();
  await browser.close();
  return content;
};

const getAllSamsungModelsLinkFromOnePage = async (pageNumber = 1) => {
  try {
    const url = `${BASE_URL}/samsung-phones-f-9-0-p${pageNumber}.php`;
    const html = await fetchData(url);
    const $ = cheerio.load(html);

    const urls = [];
    $(".makers ul li a").each((index, element) => {
      const modelUrl = $(element).attr("href");
      const fullModelUrl = `${BASE_URL}/${modelUrl}`;
      urls.push(fullModelUrl);
    });

    return urls;
  } catch (error) {
    console.error(error.message);
    console.log(error);
    console.log("Too many requests, please wait before next request");
    return getAllSamsungModelsLinkFromOnePage(pageNumber); // Retry the request
  }
};

const getSamsungModelDetails = async (modelUrl) => {
  try {
    const html = await fetchData(modelUrl);
    const $ = cheerio.load(html);

    const statusText = $(".ttl")
      .filter((index, element) => {
        return $(element).text().includes("Status");
      })
      .next(".nfo")
      .text();

    const model = {
      name: $(".specs-phone-name-title").text().replace("Samsung ", ""),
      releaseDate: parseDate(statusText),
      models: $(".ttl")
        .filter((index, element) => {
          return $(element).text().includes("Models");
        })
        .next(".nfo")
        .text()
        .split(",")
        .map((model) => model.trim()),
    };

    return model;
  } catch (error) {
    console.error(error.message);
    return getSamsungModelDetails(modelUrl); // Retry the request
  }
};

const main = async () => {
  try {
    const phones = [];

    for (let i = 1; i <= 1; i++) {
      const models = await getAllSamsungModelsLinkFromOnePage(i);

      const currentPagePhones = [];
      const totalModels = models.length;
      const maxModels = Math.min(10, totalModels);

      console.log(
        `Scraping ${maxModels} out of ${totalModels} models from page ${i}`
      );

      for (let j = 0; j < maxModels; j++) {
        const details = await getSamsungModelDetails(models[j]);
        currentPagePhones.push(details);
        console.log(`Model ${j + 1}/${maxModels}:`, JSON.stringify(details));
      }

      phones.push(...currentPagePhones);
      writeObjectToFile(phones, `samsung-phones-page-${i}.json`);
    }

    writeObjectToFile(
      phones,
      `samsung-phones${Math.floor(Date.now() / 1000)}.json`
    );
  } catch (error) {
    console.error(error.message);
  }
};

main();
