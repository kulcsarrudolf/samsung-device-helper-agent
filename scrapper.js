const axios = require("axios");
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
  try {
    console.log(`Fetching URL: ${url} at ${new Date().toISOString()}`);
    const response = await axios.get(url);
    await new Promise((resolve) => setTimeout(resolve, 1 * 60 * 1000)); // Wait for 1 minute
    return response.data;
  } catch (error) {
    console.error(`Error fetching URL: ${url} at ${new Date().toISOString()}`);
    console.error(error.message);
    await waitWithExponentialBackoff();
    return fetchData(url); // Retry the request
  }
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
      console.log("Page Number: ", i);
      const models = await getAllSamsungModelsLinkFromOnePage(i);

      console.log(models);

      const currentPagePhones = [];

      for (let j = 0; j < models.length; j++) {
        const details = await getSamsungModelDetails(models[j]);
        currentPagePhones.push(details);
      }

      phones.push(...currentPagePhones);
    }

    writeObjectToFile(phones, "samsung-phones.json");
  } catch (error) {
    console.error(error.message);
  }
};

main();
