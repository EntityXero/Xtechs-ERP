export interface StorageProvider {
  /**
   * Write file buffer to storage.
   * Returns the storage path/key.
   */
  put(path: string, buffer: Buffer, mimeType: string): Promise<string>;

  /**
   * Read file buffer from storage.
   */
  get(path: string): Promise<Buffer>;

  /**
   * Delete file from storage.
   */
  delete(path: string): Promise<void>;

  /**
   * Get a signed or direct access URL for the file.
   */
  getSignedUrl(path: string, expiresInSeconds?: number): Promise<string>;
}
