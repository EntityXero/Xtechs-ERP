import type { StorageProvider } from './provider.js';
import { LocalFileSystemProvider } from './local-provider.js';

let activeProvider: StorageProvider;

export function getStorageProvider(): StorageProvider {
  if (!activeProvider) {
    const driver = process.env['STORAGE_DRIVER'] || 'local';
    if (driver === 'local') {
      activeProvider = new LocalFileSystemProvider();
    } else {
      throw new Error(`Unsupported storage driver: ${driver}`);
    }
  }
  return activeProvider;
}

export * from './provider.js';
export * from './local-provider.js';
