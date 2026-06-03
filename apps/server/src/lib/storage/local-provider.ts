import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SignJWT } from 'jose';
import type { StorageProvider } from './provider.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class LocalFileSystemProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    // Default to the monorepo root uploads folder
    const rootDir = resolve(__dirname, '../../../../..');
    this.baseDir = process.env['LOCAL_STORAGE_DIR'] || join(rootDir, 'uploads');
  }

  private getAbsolutePath(storagePath: string): string {
    // Prevent directory traversal attacks
    const resolvedPath = resolve(this.baseDir, storagePath);
    if (!resolvedPath.startsWith(resolve(this.baseDir))) {
      throw new Error('Directory traversal detected');
    }
    return resolvedPath;
  }

  async put(storagePath: string, buffer: Buffer, _mimeType: string): Promise<string> {
    const fullPath = this.getAbsolutePath(storagePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
    return storagePath;
  }

  async get(storagePath: string): Promise<Buffer> {
    const fullPath = this.getAbsolutePath(storagePath);
    return readFile(fullPath);
  }

  async delete(storagePath: string): Promise<void> {
    const fullPath = this.getAbsolutePath(storagePath);
    try {
      await unlink(fullPath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async getSignedUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
    const secret = process.env['JWT_SECRET'] || 'dev-secret-change-in-production';
    const secretKey = new TextEncoder().encode(secret);

    // Create a temporary signed token for this specific storage path
    const token = await new SignJWT({ storagePath })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresInSeconds}s`)
      .sign(secretKey);

    return `/api/attachments/download?token=${token}`;
  }
}
