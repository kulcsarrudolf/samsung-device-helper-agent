declare module 'samsung-device-helper' {
  export interface LibraryDevice {
    name: string;
    releaseDate?: string;
    models?: string[];
  }

  export function getNameByModel(model: string): string | undefined;
  export function getAllSamsungPhones(): LibraryDevice[];
  export function getAllSamsungTablets(): LibraryDevice[];
  export function getAllSamsungWatches(): LibraryDevice[];
  export function getAllSamsungDevices(): LibraryDevice[];
}
