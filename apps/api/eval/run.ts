import type { SoapNote } from '@attune/shared';

import { createGeminiScribeModel } from '../src/ai/gemini-scribe-model.js';
import { NOTE_PROMPT } from '../src/ai/prompts.js';
import { ScribeModelError } from '../src/ai/scribe-model.js';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { streamWithOneRetry } from '../src/lib/retry.js';
import { EVAL_CASES, type EvalCase } from './cases.js';
import { checkNote, type CheckResult } from './checks.js';

/**
 * Runs each synthetic transcript through the real note-drafting stage (the
 * same adapter, prompt and model the API uses) and checks the result.
 *
 * It calls the live model, so it is run by hand with `pnpm eval` and is not
 * part of CI. It covers the drafting stage only; transcription needs audio.
 */

const TIMEOUT_MS = 60_000;

type Outcome =
  | { evalCase: EvalCase; note: SoapNote; checks: CheckResult[] }
  | { evalCase: EvalCase; error: string };

function configOrExit() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

const config = configOrExit();
const model = createGeminiScribeModel({
  apiKey: config.GOOGLE_GENERATIVE_AI_API_KEY,
  modelId: config.GEMINI_MODEL,
});

async function draft(evalCase: EvalCase): Promise<SoapNote> {
  const events = streamWithOneRetry(
    () => model.draftNote(evalCase.transcript, AbortSignal.timeout(TIMEOUT_MS)),
    {
      isRetryable: (error) => error instanceof ScribeModelError && error.retryable,
      backoffMs: 1_000,
    },
  );
  for await (const event of events) {
    if (event.type === 'final') {
      return event.note;
    }
  }
  throw new Error('The model stream ended without a note');
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'unknown error';
  }
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

const outcomes: Outcome[] = [];
for (const evalCase of EVAL_CASES) {
  try {
    const note = await draft(evalCase);
    outcomes.push({ evalCase, note, checks: checkNote(note, evalCase.expect) });
  } catch (error) {
    outcomes.push({ evalCase, error: describeError(error) });
  }
}

const idWidth = Math.max(...EVAL_CASES.map((evalCase) => evalCase.id.length), 'case'.length);
console.log(`Model: ${config.GEMINI_MODEL}    Prompt: ${NOTE_PROMPT.version}\n`);
console.log(`${'case'.padEnd(idWidth)}  result  checks`);
console.log(`${'-'.repeat(idWidth)}  ------  ------`);

let passedCases = 0;
for (const outcome of outcomes) {
  const id = outcome.evalCase.id.padEnd(idWidth);
  if ('error' in outcome) {
    console.log(`${id}  ERROR   ${outcome.error}`);
    continue;
  }

  const failed = outcome.checks.filter((check) => !check.passed);
  const passed = failed.length === 0;
  passedCases += passed ? 1 : 0;
  console.log(
    `${id}  ${passed ? 'PASS ' : 'FAIL '}   ${String(outcome.checks.length - failed.length)}/${String(outcome.checks.length)}`,
  );
  for (const check of failed) {
    console.log(`${' '.repeat(idWidth)}          - ${check.description}`);
    console.log(`${' '.repeat(idWidth)}            got: ${JSON.stringify(check.actual)}`);
  }
}

console.log(`\n${String(passedCases)}/${String(outcomes.length)} cases passed`);
process.exit(passedCases === outcomes.length ? 0 : 1);
