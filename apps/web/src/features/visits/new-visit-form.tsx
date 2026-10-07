'use client';

import { FileAudio, Mic, Upload, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/features/auth/form-fields';
import { DISCLAIMER } from '@/lib/disclaimer';
import { visitPath } from '@/lib/navigation';

import { AudioPreview } from './audio-preview';
import { FilePicker } from './file-picker';
import { visitPageFor } from './process-run';
import { useProcessRun } from './process-run-provider';
import { RecorderPanel } from './recorder-panel';
import { RunProgress } from './run-progress';
import { SamplePicker } from './sample-picker';
import { audioFromRecording, type SelectedAudio } from './selected-audio';
import { useRecorder } from './use-recorder';
import {
  CONSENT_REQUIRED,
  suggestTitle,
  validateNewVisit,
  type NewVisitErrors,
  type NewVisitField,
} from './validation';

type Source = 'record' | 'upload' | 'sample';

const SOURCES: readonly { value: Source; label: string; icon: LucideIcon }[] = [
  { value: 'record', label: 'Record', icon: Mic },
  { value: 'upload', label: 'Upload', icon: Upload },
  { value: 'sample', label: 'Sample', icon: FileAudio },
];

/**
 * The new-visit page: confirm consent, add the conversation (record it, upload
 * a file, or take a sample), name the visit, then create the note.
 *
 * Consent comes first on purpose. The record button will not start without
 * it, and the API refuses to process a visit that has none.
 *
 * The form stays on screen while the recording uploads, so that cancelling or
 * a refusal brings it back as it was. Once the API starts answering, the
 * browser moves to the visit's own page, which shows the result arriving.
 */
export function NewVisitForm() {
  const { state: runState, start, retry, abandon, clear } = useProcessRun();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const consentRef = useRef<HTMLInputElement>(null);
  const focusFirstError = useRef(false);

  const [consent, setConsent] = useState(false);
  const [source, setSource] = useState<Source>('record');
  const [audio, setAudio] = useState<SelectedAudio | null>(null);
  const [title, setTitle] = useState('');
  // Until the user types a title, each newly chosen audio may suggest one.
  const [titleEdited, setTitleEdited] = useState(false);
  const [errors, setErrors] = useState<NewVisitErrors>({});
  // The run outlives this page, so one may be left over from an earlier visit to it.
  const [startedHere, setStartedHere] = useState(false);

  const clearError = (field: NewVisitField): void => {
    setErrors(({ [field]: _cleared, ...rest }) => rest);
  };

  const select = (chosen: SelectedAudio): void => {
    setAudio(chosen);
    clearError('audio');
    if (!titleEdited) {
      setTitle(suggestTitle(chosen, new Date()));
      clearError('title');
    }
  };

  const recorder = useRecorder((recording, endedBy) => {
    select(audioFromRecording(recording, endedBy));
  });
  const recorderBusy =
    recorder.state.status === 'recording' || recorder.state.status === 'requesting';

  const startRecording = (): void => {
    if (!consent) {
      setErrors((current) => ({ ...current, consent: CONSENT_REQUIRED }));
      consentRef.current?.focus();
      return;
    }
    clearError('audio');
    recorder.start();
  };

  // After a failed submit, put the cursor where the first problem is.
  useEffect(() => {
    if (focusFirstError.current) {
      focusFirstError.current = false;
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors]);

  // Audio that has not been uploaded exists only in this tab: warn before a reload or a closed tab loses it.
  const unsaved = audio !== null || recorderBusy;
  useEffect(() => {
    if (!unsaved) {
      return;
    }
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved]);

  const destination = startedHere ? visitPageFor(runState) : null;
  useEffect(() => {
    if (destination !== null) {
      router.replace(destination);
    }
  }, [destination, router]);

  // Tidy up a run this page did not start. A finished one is simply forgotten.
  // One that failed before the upload got through left an empty visit behind, which is removed.
  useEffect(() => {
    if (startedHere) {
      return;
    }
    if (runState.phase === 'failed' && runState.step === 'uploading') {
      abandon();
    } else if (runState.phase === 'failed' || runState.phase === 'done') {
      clear();
    }
  }, [startedHere, runState, abandon, clear]);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const checked = validateNewVisit({ consent, audio, title, recording: recorderBusy });
    if (!checked.ok) {
      focusFirstError.current = true;
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setTitle(checked.data.title);
    setStartedHere(true);
    start(checked.data);
  };

  if (startedHere && runState.phase !== 'idle') {
    return (
      <RunProgress
        state={runState}
        onRetry={retry}
        onBack={() => {
          abandon();
          setStartedHere(false);
        }}
      />
    );
  }

  // One run at a time: a note is still being made for a visit started earlier.
  if (runState.phase === 'running') {
    return (
      <Alert>
        <AlertTitle>A note is still being created</AlertTitle>
        <AlertDescription>
          <p>
            “{runState.title}” is being processed. You can start a new visit as soon as it has
            finished.
          </p>
          {runState.visitId !== null && (
            <p>
              <Link href={visitPath(runState.visitId)}>Open that visit</Link>
            </p>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-10">
      <section aria-labelledby="consent-heading" className="space-y-3">
        <h2 id="consent-heading" className="text-lg font-semibold">
          Consent
        </h2>
        <div className="flex items-start gap-3">
          <input
            ref={consentRef}
            id="consent"
            name="consent"
            type="checkbox"
            checked={consent}
            aria-invalid={errors.consent !== undefined}
            aria-describedby={errors.consent === undefined ? 'consent-hint' : 'consent-error'}
            onChange={(event) => {
              setConsent(event.target.checked);
              clearError('consent');
            }}
            className="mt-0.5 size-5 shrink-0 rounded accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-3 aria-invalid:ring-destructive/30"
          />
          <div className="space-y-1">
            <label htmlFor="consent" className="font-medium">
              Everyone in this conversation has agreed to it being recorded and transcribed by AI.
            </label>
            <p id="consent-hint" className="text-sm text-muted-foreground">
              The time of this confirmation is saved with the visit. Without it, no recording is
              made and no note is generated.
            </p>
          </div>
        </div>
        {errors.consent !== undefined && (
          <p id="consent-error" className="text-sm text-destructive">
            {errors.consent}
          </p>
        )}
      </section>

      <section aria-labelledby="audio-heading" className="space-y-4">
        <div className="space-y-1">
          <h2 id="audio-heading" className="text-lg font-semibold">
            Conversation
          </h2>
          <p className="text-sm text-muted-foreground">{DISCLAIMER.recording}</p>
        </div>

        {audio === null ? (
          <>
            <fieldset disabled={recorderBusy} className="group">
              <legend className="sr-only">How to add the conversation</legend>
              <div className="inline-flex gap-1 rounded-lg bg-muted p-1 group-disabled:opacity-60">
                {SOURCES.map(({ value, label, icon: Icon }) => (
                  <label
                    key={value}
                    className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors group-disabled:cursor-not-allowed has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name="source"
                      value={value}
                      checked={source === value}
                      onChange={() => {
                        setSource(value);
                        clearError('audio');
                      }}
                      className="sr-only"
                    />
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {source === 'record' && <RecorderPanel recorder={recorder} onStart={startRecording} />}
            {source === 'upload' && <FilePicker onSelected={select} />}
            {source === 'sample' && <SamplePicker onSelected={select} />}
          </>
        ) : (
          <AudioPreview
            audio={audio}
            onRemove={() => {
              setAudio(null);
            }}
          />
        )}

        {errors.audio !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {errors.audio}
          </p>
        )}
      </section>

      <section aria-labelledby="title-heading" className="space-y-3">
        <h2 id="title-heading" className="sr-only">
          Title
        </h2>
        <TextField
          name="title"
          label="Visit title"
          value={title}
          maxLength={200}
          autoComplete="off"
          hint="Shown in your list of visits. Leave out names and other identifying details."
          error={errors.title}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleEdited(true);
            clearError('title');
          }}
        />
      </section>

      <Button type="submit" className="h-11 px-5 text-base">
        Create note
      </Button>
    </form>
  );
}
