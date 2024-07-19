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

const getAllSamsungModelsLinkFromOnePage = async (pageNumber = 1) => {
  try {
    const response = await axios.get(
      `${BASE_URL}/samsung-phones-f-9-0-p${pageNumber}.php`
    );
    const html = response.data;
    const $ = cheerio.load(html);

    const urls = [];
    $(".makers ul li a").each((index, element) => {
      const modelUrl = $(element).attr("href");

      let fullModelUrl = `${BASE_URL}/${modelUrl}`;

      urls.push(fullModelUrl);
    });

    return urls;
  } catch (error) {
    console.log("Too many requests, please wait before next request");
    await waitWithExponentialBackoff();
    return getAllSamsungModelsLinkFromOnePage(pageNumber); // Retry the request
  }
};

const getSamsungModelDetails = async (modelUrl) => {
  try {
    const response = await axios.get(modelUrl);
    const html = response.data;
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

    console.log(JSON.stringify(error));

    await waitWithExponentialBackoff();
    return getSamsungModelDetails(modelUrl); // Retry the request
  }
};

const waitWithExponentialBackoff = (() => {
  let attempts = 0;

  return async () => {
    const waitTime = Math.min(10000 * Math.pow(2, attempts), 60000); // Cap the wait time at 60 seconds
    console.log(`Waiting for ${waitTime / 1000} seconds before retrying...`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
    attempts += 1;
  };
})();

const clearAttempts = () => {
  waitWithExponentialBackoff.attempts = 0;
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
        await new Promise(
          (resolve) => setTimeout(resolve, 60000) // Fixed delay of 60 seconds
        );
        currentPagePhones.push(details);
        clearAttempts(); // Clear attempts after a successful request
      }

      phones.push(...currentPagePhones);

      await new Promise(
        (resolve) => setTimeout(resolve, 60000) // Fixed delay of 60 seconds
      );
    }

    writeObjectToFile(phones, "samsung-phones.json");
  } catch (error) {
    console.error(error.message);
  }
};

main();
