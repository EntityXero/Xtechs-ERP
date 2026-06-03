import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export const MAX_FILE_SIZES = {
  IMAGE: 10 * 1024 * 1024, // 10 MB
  PDF: 25 * 1024 * 1024,   // 25 MB
} as const;

export const MAGIC_BYTES = {
  JPEG: [0xFF, 0xD8, 0xFF],
  PNG: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  WEBP: [0x52, 0x49, 0x46, 0x46], // RIFF (bytes 0-3), WEBP at 8-11
  PDF: [0x25, 0x50, 0x44, 0x46],  // %PDF
} as const;

/**
 * Validation schema for linking an attachment to an entity.
 */
export const uploadAttachmentSchema = z.object({
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
});

export type UploadAttachmentInput = z.infer<typeof uploadAttachmentSchema>;
