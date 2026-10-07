import {
  pickRecordingFormat,
  RECORDING_BITS_PER_SECOND,
  type RecordingFormat,
} from './recording-format';

/** Why a recording could not start. */
export type RecorderProblem = 'unsupported' | 'permission-denied' | 'no-microphone' | 'failed';

export class RecorderError extends Error {
  constructor(readonly problem: RecorderProblem) {
    super(`Recording could not start: ${problem}`);
    this.name = 'RecorderError';
  }
}

export type FinishedRecording = {
  blob: Blob;
  durationMs: number;
  format: RecordingFormat;
};

export type RecorderSession = {
  /** Reads the microphone's signal as it comes in, for the level display. */
  analyser: AnalyserNode;
  elapsedMs: () => number;
  /** Ends the recording. The audio is handed to the `onFinished` callback. */
  stop: () => void;
  /** Ends the recording and throws the audio away. */
  discard: () => void;
};

/** Sorts the error a browser raises for a refused microphone request. */
export function recorderProblem(error: unknown): RecorderProblem {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'permission-denied';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'no-microphone';
  }
  return 'failed';
}

function supportedFormat(): RecordingFormat | null {
  // Typed as always present, but missing on pages not served over HTTPS and in older browsers.
  const devices = (navigator as Partial<Navigator>).mediaDevices;
  if (devices === undefined || typeof MediaRecorder === 'undefined') {
    return null;
  }
  return pickRecordingFormat((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

/**
 * Asks for the microphone and starts recording. Browser only.
 *
 * The audio is collected in memory and nowhere else. When the recording ends,
 * whether through `stop`, or because the microphone went away, the finished
 * file is handed to `onFinished` and the microphone is released.
 *
 * Rejects with a `RecorderError` if recording cannot start.
 */
export async function startRecorderSession(
  onFinished: (recording: FinishedRecording) => void,
): Promise<RecorderSession> {
  const format = supportedFormat();
  if (format === null) {
    throw new RecorderError('unsupported');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
  } catch (error) {
    throw new RecorderError(recorderProblem(error));
  }

  const context = new AudioContext();
  const release = (): void => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    void context.close().catch(() => undefined);
  };

  try {
    // The analyser only listens. It is not connected to the speakers, so nothing is played back.
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    void context.resume().catch(() => undefined);

    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      audioBitsPerSecond: RECORDING_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    let endedAt: number | null = null;
    let discarded = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      endedAt ??= performance.now();
      release();
      if (!discarded) {
        onFinished({
          blob: new Blob(chunks, { type: format.containerType }),
          durationMs: endedAt - startedAt,
          format,
        });
      }
    };
    // A chunk every second keeps memory use even; the chunks are joined at the end.
    recorder.start(1_000);

    const end = (): void => {
      endedAt ??= performance.now();
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
    };

    return {
      analyser,
      elapsedMs: () => (endedAt ?? performance.now()) - startedAt,
      stop: end,
      discard: () => {
        discarded = true;
        end();
      },
    };
  } catch {
    release();
    throw new RecorderError('failed');
  }
}
