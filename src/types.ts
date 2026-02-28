export interface SamsungDevice {
  name: string;
  releaseDate: string | null;
  models: string[];
}

export interface MissingDevicesReport {
  generatedAt: string;
  latestDeviceInLibrary: { name: string; releaseDate: string } | null;
  totalDevicesInLibrary: number;
  totalMissingDevices: number;
  missingDevices: SamsungDevice[];
}

export interface ScraperConfig {
  pages: number;
  maxModelsPerPage: number;
}

export interface LibraryDevice {
  name: string;
  releaseDate?: string;
  models?: string[];
}
