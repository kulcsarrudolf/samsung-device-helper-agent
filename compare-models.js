const {
  getNameByModel,
  getAllSamsungPhones,
  getAllSamsungTablets,
  getAllSamsungWatches,
  getAllSamsungDevices,
} = require("samsung-device-helper");
const fs = require("fs");

const loadScrapedData = () => {
  try {
    const data = fs.readFileSync("samsung-phones-page-1.json", "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading scraped data:", error.message);
    return [];
  }
};

const parseReleaseDate = (dateString) => {
  if (!dateString) return null;
  try {
    const [month, day, year] = dateString.split("-");
    return new Date(year, parseInt(month) - 1, day);
  } catch (error) {
    return null;
  }
};

const main = async () => {
  console.log("🔍 Loading data from samsung-device-helper library...");

  // Get all existing Samsung devices from the library
  const existingPhones = getAllSamsungPhones();
  const existingTablets = getAllSamsungTablets();
  const existingWatches = getAllSamsungWatches();
  const allExistingDevices = getAllSamsungDevices();

  console.log(`📱 Found ${existingPhones.length} phones in library`);
  console.log(`📱 Found ${existingTablets.length} tablets in library`);
  console.log(`⌚ Found ${existingWatches.length} watches in library`);
  console.log(`📱 Total devices in library: ${allExistingDevices.length}`);

  // Find the latest model in the library by release date
  console.log("\n🔍 Finding latest model in the library...");
  let latestDevice = null;
  let latestDate = null;

  for (const device of allExistingDevices) {
    if (device.releaseDate) {
      const deviceDate = parseReleaseDate(device.releaseDate);
      if (deviceDate && (!latestDate || deviceDate > latestDate)) {
        latestDate = deviceDate;
        latestDevice = device;
      }
    }
  }

  if (latestDevice) {
    console.log(
      `🚀 Latest device in library: ${latestDevice.name} (${latestDevice.releaseDate})`
    );
    console.log(
      `   Models: ${
        latestDevice.models ? latestDevice.models.join(", ") : "N/A"
      }`
    );
  } else {
    console.log("⚠️  No devices with release dates found in library");
  }

  // Load our scraped data
  console.log("\n📖 Loading scraped data...");
  const scrapedData = loadScrapedData();
  console.log(`Found ${scrapedData.length} scraped devices`);

  // Create a map of existing devices by name for quick lookup
  const existingDevicesByName = new Map();
  const existingDevicesByModel = new Map();

  allExistingDevices.forEach((device) => {
    // Normalize device name for comparison
    const normalizedName = device.name.toLowerCase().replace(/samsung\s+/i, "");
    existingDevicesByName.set(normalizedName, device);

    // Also index by models
    if (device.models && Array.isArray(device.models)) {
      device.models.forEach((model) => {
        existingDevicesByModel.set(model, device);
      });
    }
  });

  // Find missing devices
  console.log("\n🔍 Comparing scraped data with library...");
  const missingDevices = [];

  for (const scrapedDevice of scrapedData) {
    const normalizedScrapedName = scrapedDevice.name
      .toLowerCase()
      .replace(/galaxy\s+/i, "");

    // Check if device exists by name
    let foundByName = false;
    for (const [existingName, existingDevice] of existingDevicesByName) {
      if (
        existingName.includes(normalizedScrapedName) ||
        normalizedScrapedName.includes(existingName)
      ) {
        foundByName = true;
        console.log(
          `✅ Found match: ${scrapedDevice.name} ↔ ${existingDevice.name}`
        );
        break;
      }
    }

    // Check if device exists by model
    let foundByModel = false;
    if (!foundByName && scrapedDevice.models) {
      for (const model of scrapedDevice.models) {
        if (existingDevicesByModel.has(model)) {
          foundByModel = true;
          const existingDevice = existingDevicesByModel.get(model);
          console.log(
            `✅ Found match by model: ${scrapedDevice.name} (${model}) ↔ ${existingDevice.name}`
          );
          break;
        }
      }
    }

    if (!foundByName && !foundByModel) {
      console.log(`❌ Missing device: ${scrapedDevice.name}`);
      missingDevices.push(scrapedDevice);
    }
  }

  // Create file with missing models
  console.log(`\n📝 Found ${missingDevices.length} missing devices`);

  if (missingDevices.length > 0) {
    // Reverse the order of missing devices (newest last becomes newest first)
    const reversedMissingDevices = [...missingDevices].reverse();

    const missingDevicesData = {
      generatedAt: new Date().toISOString(),
      latestDeviceInLibrary: latestDevice
        ? {
            name: latestDevice.name,
            releaseDate: latestDevice.releaseDate,
          }
        : null,
      totalDevicesInLibrary: allExistingDevices.length,
      totalMissingDevices: reversedMissingDevices.length,
      missingDevices: reversedMissingDevices.map((device) => ({
        name: device.name,
        releaseDate: device.releaseDate,
        models: device.models,
      })),
    };

    const fileName = "missing-samsung-models.json";
    fs.writeFileSync(fileName, JSON.stringify(missingDevicesData, null, 2));
    console.log(`✅ Created file: ${fileName}`);

    console.log("\n📋 Missing devices (in reverse order):");
    reversedMissingDevices.forEach((device, index) => {
      console.log(`${index + 1}. ${device.name} (${device.releaseDate})`);
      if (device.models) {
        console.log(`   Models: ${device.models.join(", ")}`);
      }
    });
  } else {
    console.log(
      "🎉 No missing devices found! All scraped devices are already in the library."
    );
  }

  console.log("\n✅ Comparison complete!");
};

main().catch(console.error);
