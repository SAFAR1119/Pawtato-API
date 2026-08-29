import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function imageFileFilter(
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException('File must be a JPEG, PNG, or WebP image'),
      false,
    );
    return;
  }

  callback(null, true);
}

// Phase 16 — medical/vaccination document attachments (certificates, vet
// letters, lab results). A superset of the image types above plus PDF,
// since a scanned certificate is at least as likely to be a PDF as a photo.
// A larger size cap than plain images (10MB vs 5MB) — a multi-page PDF
// report is realistically bigger than a single photo.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  ...ALLOWED_IMAGE_MIME_TYPES,
  'application/pdf',
];

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export function documentFileFilter(
  req: Request,
  file: Express.Multer.File,
  callback: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
    callback(
      new BadRequestException('File must be a JPEG, PNG, WebP image, or PDF'),
      false,
    );
    return;
  }

  callback(null, true);
}
