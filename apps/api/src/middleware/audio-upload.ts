import { AUDIO_FIELD_NAME, MAX_AUDIO_BYTES } from '@attune/shared';
import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';

import { AppError } from '../lib/app-error.js';

/**
 * Parses the multipart upload of one recording into memory. Memory storage is
 * deliberate: the audio exists only for the length of the request and is never
 * written to disk, a database or object storage.
 */
export function audioUpload(): RequestHandler {
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 4, fieldSize: 1024 },
    // A cheap first gate on the declared type; the controller then checks the actual bytes.
    fileFilter: (_req, file, callback) => {
      if (file.mimetype.startsWith('audio/')) {
        callback(null, true);
      } else {
        callback(
          new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload an audio recording.', {
            reason: 'upload_not_audio',
          }),
        );
      }
    },
  }).single(AUDIO_FIELD_NAME);

  return (req, res, next) => {
    parse(req, res, (error: unknown) => {
      if (error === undefined || error === null) {
        next();
      } else if (error instanceof MulterError || error instanceof AppError) {
        next(error);
      } else {
        // Whatever else fails while reading a multipart body (a missing boundary,
        // a body cut short) is a broken request, not a server fault.
        next(new AppError(400, 'BAD_REQUEST', 'The upload could not be read.'));
      }
    });
  };
}
