/**
 * Builds the sample consultations in `public/samples` from the scripts below.
 *
 * Every line is invented and is spoken by the speech synthesiser that ships
 * with macOS, so no real person's words or voice are in these files. Run it
 * on a Mac, from `apps/web`:
 *
 *   node scripts/make-samples.mjs
 *
 * It prints each file's length. Copy those into `src/features/visits/samples.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SAMPLE_RATE = 22_050;
const BITS_PER_SECOND = 32_000;
const PAUSE_BETWEEN_TURNS_SEC = 0.45;
const VOICES = { Clinician: 'Daniel', Patient: 'Samantha' };

const SAMPLES = [
  {
    file: 'sore-throat.m4a',
    turns: [
      ['Clinician', 'Good morning. What brings you in today?'],
      ['Patient', 'I have had a sore throat and a dry cough for about three days.'],
      ['Clinician', 'Any fever, or trouble swallowing?'],
      ['Patient', 'A slight fever yesterday evening, but swallowing is fine.'],
      ['Clinician', 'Are you taking anything for it?'],
      ['Patient', 'Just honey and lemon tea. No medication.'],
      [
        'Clinician',
        'Let me take a look. Your temperature is 37.2, your throat looks a little red, and your chest sounds clear.',
      ],
      [
        'Clinician',
        'This looks like a viral upper respiratory infection. Rest, drink plenty of fluids, and take paracetamol if you need it. Come back if it lasts more than a week.',
      ],
      ['Patient', 'Okay, thank you.'],
    ],
  },
  {
    file: 'knee-pain.m4a',
    turns: [
      ['Clinician', 'Hello. How can I help today?'],
      [
        'Patient',
        'My right knee has been hurting for about two weeks. It started after I increased my running distance.',
      ],
      ['Clinician', 'Where exactly is the pain, and is there any swelling?'],
      [
        'Patient',
        'It is at the front, around the kneecap. There is no swelling. It is worse when I go down stairs.',
      ],
      ['Clinician', 'Any locking, or does the knee ever give way?'],
      ['Patient', 'No, nothing like that.'],
      [
        'Clinician',
        'On examination there is no swelling, you have a full range of movement, and it is tender around the kneecap. The ligaments feel stable.',
      ],
      [
        'Clinician',
        "This is most likely patellofemoral pain, often called runner's knee. Reduce your running for two weeks, apply ice after activity, and start quadriceps strengthening exercises. You can take ibuprofen with food if you need it. We will review in four weeks.",
      ],
      ['Patient', 'That sounds good. Thank you, doctor.'],
    ],
  },
];

/** Returns the raw samples of a WAV file: the contents of its `data` chunk. */
function readPcm(path) {
  const wav = readFileSync(path);
  let offset = 12; // Past "RIFF", the file size and "WAVE".
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'data') {
      return wav.subarray(offset + 8, Math.min(offset + 8 + size, wav.length));
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`No audio data found in ${path}`);
}

/** Wraps 16-bit mono samples in a minimal WAV header. */
function toWav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8, 'ascii');
  header.writeUInt32LE(16, 16); // Size of the format block.
  header.writeUInt16LE(1, 20); // Uncompressed PCM.
  header.writeUInt16LE(1, 22); // One channel.
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28); // Bytes per second.
  header.writeUInt16LE(2, 32); // Bytes per sample.
  header.writeUInt16LE(16, 34); // Bits per sample.
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const outputDir = join(import.meta.dirname, '../public/samples');
const workDir = mkdtempSync(join(tmpdir(), 'attune-samples-'));
const pause = Buffer.alloc(Math.round(SAMPLE_RATE * PAUSE_BETWEEN_TURNS_SEC) * 2);

try {
  for (const sample of SAMPLES) {
    const parts = [];
    sample.turns.forEach(([speaker, text], index) => {
      const spoken = join(workDir, `turn-${String(index)}.wav`);
      execFileSync('say', [
        '-v',
        VOICES[speaker],
        `--data-format=LEI16@${String(SAMPLE_RATE)}`,
        '-o',
        spoken,
        text,
      ]);
      parts.push(readPcm(spoken), pause);
    });

    const pcm = Buffer.concat(parts);
    const combined = join(workDir, 'combined.wav');
    const output = join(outputDir, sample.file);
    writeFileSync(combined, toWav(pcm));
    execFileSync('afconvert', [
      '-f',
      'm4af',
      '-d',
      'aac',
      '-b',
      String(BITS_PER_SECOND),
      combined,
      output,
    ]);

    // The encoder pads the audio slightly, so the length is read back from the finished file.
    const info = execFileSync('afinfo', [output], { encoding: 'utf8' });
    const seconds = Math.round(Number(/estimated duration: ([\d.]+)/.exec(info)?.[1]));
    const kilobytes = Math.round(statSync(output).size / 1024);
    console.log(`${sample.file}: ${String(seconds)} s, ${String(kilobytes)} KB`);
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
