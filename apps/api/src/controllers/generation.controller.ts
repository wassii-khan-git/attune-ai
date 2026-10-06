import { AUDIO_FIELD_NAME, processVisitFieldsSchema, visitIdParamsSchema } from '@attune/shared';
import type { Request, Response } from 'express';

import { AppError } from '../lib/app-error.js';
import { detectAudioMediaType } from '../lib/audio-format.js';
import { requireAuth } from '../middleware/authenticate.js';
import type { GenerationService } from '../services/generation.service.js';

export type GenerationController = {
  process: (req: Request, res: Response) => Promise<void>;
};

export function createGenerationController(service: GenerationService): GenerationController {
  return {
    process: async (req, res) => {
      const caller = requireAuth(req);
      const { id } = visitIdParamsSchema.parse(req.params);
      const { durationSec } = processVisitFieldsSchema.parse(req.body ?? {});

      if (req.file === undefined) {
        throw new AppError(400, 'VALIDATION_ERROR', 'The request is not valid.', [
          { path: AUDIO_FIELD_NAME, message: 'An audio file is required' },
        ]);
      }
      const mediaType = detectAudioMediaType(req.file.buffer);
      if (mediaType === null) {
        throw new AppError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          'This file is not a supported audio recording.',
        );
      }

      // Everything that can be refused is refused here, with a normal status code.
      const events = await service.begin(
        caller,
        id,
        { audio: { data: req.file.buffer, mediaType }, durationSec },
        req.log,
      );

      // From here on the status is 200 and each line is one event; failures arrive as an `error` event.
      res
        .status(200)
        .set({
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store',
          // Tells buffering proxies to pass each line through as it is written.
          'X-Accel-Buffering': 'no',
        })
        .flushHeaders();

      for await (const event of events) {
        // If the client has gone, the run still finishes so the result is saved for their next visit.
        if (!res.destroyed) {
          res.write(`${JSON.stringify(event)}\n`);
        }
      }
      res.end();
    },
  };
}
