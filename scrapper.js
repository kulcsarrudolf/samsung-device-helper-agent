const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://www.gsmarena.com";

const writeObjectToFile = (object, fileName) => {
  const fs = require("fs");
  fs.writeFileSync
    ? fs.writeFileSync
    : fs.writeFile(
        fileName,
        JSON.stringify(object, null, 2),
        { flag: "w" },
        (err) => {
          if (err) {
            console.error(err);
          }
        }
      );
};

const getRandomBetween = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1) + min);
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
    console.log("Too many requests, please wait 10s before next request");
    console.log("pageNumber", pageNumber);

    return [];
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
    // console.error("Error fetching Samsung model details ", modelUrl);
    console.error(error.message);

    console.log(JSON.stringify(error));

    return {};
  }
};
// Example usage:
(async () => {
  try {
    // get for first 7 pages

    const phones = [];

    const allModelsUrl = [];
    // for (let i = 1; i <= 1; i++) {
    //   console.log("Page Number: ", i);
    //   const models = await getAllSamsungModelsLinkFromOnePage(i);

    //   console.log(models);

    //   const currentPagePhones = [];

    //   const details = await getSamsungModelDetails(allModelsUrl[0]);
    //   // await new Promise((resolve) =>
    //   //   setTimeout(resolve, getRandomBetween(10000, 20000))
    //   // );
    //   currentPagePhones.push(...details);
    //   writeObjectToFile(currentPagePhones, `samsung-phones-page${i}.json`);

    //   allModelsUrl.push(...(models || []));

    //   // await new Promise((resolve) =>
    //   //   setTimeout(resolve, getRandomBetween(30000, 32000))
    //   // );

    //   phones.push(...currentPagePhones);
    //   // wait 30s before next request
    // }

    const x = await getSamsungModelDetails(
      "https://www.gsmarena.com/samsung_galaxy_z_fold6-13147.php"
    );

    writeObjectToFile(x, "samsung-phones.json");

    // const details = await getSamsungModelDetails(allModelsUrl[0]);
    // console.log(details);

    // allModelsUrl.forEach(async (modelUrl) => {
    //   const details = await getSamsungModelDetails(modelUrl);
    //   console.log(details);
    //   // wait 10s before next request

    //   await new Promise((resolve) => setTimeout(resolve, 10000));
    // });

    console.log("All Samsung Models:", allModelsUrl.length);
  } catch (error) {
    console.error(error.message);
  }
})();
