import { NOT_DISCUSSED, type SoapNote, type Transcript } from '@attune/shared';
import { describe, expect, it } from 'vitest';

import { createGeminiScribeModels, toScribeModelError } from './gemini-scribe-model.js';
import { ScribeModelError, type NoteDraftEvent } from './scribe-model.js';

const TRANSCRIPT: Transcript = [
  { speaker: 'Clinician', text: 'How have you been sleeping?' },
  { speaker: 'Patient', text: 'Badly, for about a week.' },
];
const NOTE: SoapNote = {
  subjective: 'Poor sleep for about a week.',
  objective: NOT_DISCUSSED,
  assessment: NOT_DISCUSSED,
  plan: NOT_DISCUSSED,
};
const AUDIO = { data: new Uint8Array([1, 2, 3]), mediaType: 'audio/wav' };

/** What the provider says about itself. None of it may end up in an error message. */
const PROVIDER_WORDING = 'The model is overloaded. Please try again later.';

/** A Gemini answer whose single text part is `text`. */
function answer(text: string): string {
  return JSON.stringify({
    candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  });
}

function json(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } });
}

function refusal(status: number): Response {
  return json(JSON.stringify({ error: { code: status, message: PROVIDER_WORDING } }), status);
}

/** The streamed form of the same answer. */
function stream(text: string): Response {
  return new Response(`data: ${answer(text)}\n\n`, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Stands in for the provider: notes which model each request names, and answers from a script. */
function fakeProvider(respond: (modelId: string) => Response) {
  const calls: string[] = [];
  const fetch: typeof globalThis.fetch = (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const modelId = /\/models\/([^:/]+):/.exec(url)?.[1] ?? 'no model in the address';
    calls.push(modelId);
    return Promise.resolve(respond(modelId));
  };
  return { calls, fetch };
}

function models(fetch: typeof globalThis.fetch, fallbacks: { listen?: string; write?: string }) {
  return createGeminiScribeModels({
    apiKey: 'test-key',
    transcription: { modelId: 'listener', fallbackModelId: fallbacks.listen },
    note: { modelId: 'writer', fallbackModelId: fallbacks.write },
    fetch,
  });
}

async function collect(events: AsyncIterable<NoteDraftEvent>): Promise<NoteDraftEvent[]> {
  const all: NoteDraftEvent[] = [];
  for await (const event of events) {
    all.push(event);
  }
  return all;
}

const never = new AbortController().signal;

describe('createGeminiScribeModels', () => {
  it('sends transcription and note drafting to their own models', async () => {
    const provider = fakeProvider((modelId) =>
      modelId === 'listener'
        ? json(answer(JSON.stringify({ turns: TRANSCRIPT })))
        : stream(JSON.stringify(NOTE)),
    );
    const { primary } = models(provider.fetch, {});

    await expect(primary.transcribe(AUDIO, never)).resolves.toEqual(TRANSCRIPT);
    expect((await collect(primary.draftNote(TRANSCRIPT, never))).at(-1)).toEqual({
      type: 'final',
      note: NOTE,
    });
    expect(provider.calls).toEqual(['listener', 'writer']);
  });

  it('builds a fallback only for a task that names one', async () => {
    const provider = fakeProvider(() => json(answer(JSON.stringify({ turns: TRANSCRIPT }))));

    const { fallback } = models(provider.fetch, { listen: 'spare-listener' });

    expect(fallback.draftNote).toBeUndefined();
    await expect(fallback.transcribe?.(AUDIO, never)).resolves.toEqual(TRANSCRIPT);
    expect(provider.calls).toEqual(['spare-listener']);
  });

  it('drafts with the fallback note model when asked to', async () => {
    const provider = fakeProvider(() => stream(JSON.stringify(NOTE)));
    const { fallback } = models(provider.fetch, { write: 'spare-writer' });

    expect(fallback.transcribe).toBeUndefined();
    const events = fallback.draftNote?.(TRANSCRIPT, never);
    expect(events).toBeDefined();
    if (events !== undefined) {
      await collect(events);
    }

    expect(provider.calls).toEqual(['spare-writer']);
  });

  it.each([
    { status: 503, means: 'overloaded', kind: 'unavailable' },
    { status: 500, means: 'broken', kind: 'unavailable' },
    { status: 429, means: 'out of quota', kind: 'unavailable' },
    { status: 404, means: 'retired or misnamed', kind: 'unavailable' },
    { status: 400, means: 'refusing the request', kind: 'rejected' },
    { status: 403, means: 'refusing the key', kind: 'rejected' },
  ])('reports a model that is $means (HTTP $status) as $kind', async ({ status, kind }) => {
    const provider = fakeProvider(() => refusal(status));
    const { primary } = models(provider.fetch, {});

    const call = primary.transcribe(AUDIO, never);

    await expect(call).rejects.toBeInstanceOf(ScribeModelError);
    await expect(call).rejects.toMatchObject({
      kind,
      message: `The request to model "listener" failed (HTTP ${String(status)})`,
    });
    // One call only: retrying, and on which model, is the generation service's decision.
    expect(provider.calls).toEqual(['listener']);
  });

  it('reports an overloaded note model the same way, although the answer is a stream', async () => {
    const provider = fakeProvider(() => refusal(503));
    const { primary } = models(provider.fetch, {});

    await expect(collect(primary.draftNote(TRANSCRIPT, never))).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'The request to model "writer" failed (HTTP 503)',
    });
  });

  it('reports output that does not fit the schema as unusable, and worth another attempt', async () => {
    const provider = fakeProvider(() =>
      json(answer(JSON.stringify({ turns: [{ speaker: 'Nurse', text: 'Hello.' }] }))),
    );
    const { primary } = models(provider.fetch, {});

    await expect(primary.transcribe(AUDIO, never)).rejects.toMatchObject({
      kind: 'invalid_output',
      retryable: true,
    });
  });
});

describe('toScribeModelError', () => {
  it('treats a timeout as the model being unavailable', () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');

    expect(toScribeModelError(timeout, 'listener')).toMatchObject({
      kind: 'unavailable',
      retryable: true,
      message: 'The request to model "listener" timed out',
    });
  });

  it('never repeats what the provider said', () => {
    const error = toScribeModelError(new Error(PROVIDER_WORDING), 'listener');

    expect(error.message).not.toContain(PROVIDER_WORDING);
    expect(error.kind).toBe('invalid_output');
  });

  it('marks only a rejected request as not worth retrying', () => {
    expect(new ScribeModelError('x', 'rejected').retryable).toBe(false);
    expect(new ScribeModelError('x', 'unavailable').retryable).toBe(true);
    expect(new ScribeModelError('x', 'invalid_output').retryable).toBe(true);
  });

  it('passes its own errors through unchanged', () => {
    const error = new ScribeModelError('already classified', 'rejected');

    expect(toScribeModelError(error, 'listener')).toBe(error);
  });
});
