'use client';

import { Check, FileAudio, Mic, Upload, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/features/auth/form-fields';
import { DISCLAIMER } from '@/lib/disclaimer';
import { visitPath } from '@/lib/navigation';
import { useLeaveWarning } from '@/lib/navigation-guard';

import { AudioPreview } from './audio-preview';
import { ConsentDialog } from './consent-dialog';
import { FilePicker } from './file-picker';
import { visitPageFor } from './process-run';
import { useProcessRun } from './process-run-provider';
import { RecorderPanel } from './recorder-panel';
import { RunProgress } from './run-progress';
import { SamplePicker } from './sample-picker';
import { audioFromRecording, type SelectedAudio } from './selected-audio';
import { useRecorder } from './use-recorder';
import {
  suggestTitle,
  validateNewVisit,
  type NewVisitErrors,
  type NewVisitField,
  type NewVisitInput,
} from './validation';

type Source = 'record' | 'upload' | 'sample';

/** What was asked for when the consent question came up, and goes ahead once it is answered. */
type ConsentRequest = { for: 'recording' } | { for: 'note'; input: NewVisitInput };

const SOURCES: readonly { value: Source; label: string; icon: LucideIcon }[] = [
  { value: 'record', label: 'Record', icon: Mic },
  { value: 'upload', label: 'Upload', icon: Upload },
  { value: 'sample', label: 'Sample', icon: FileAudio },
];

/**
 * The new-visit page: add the conversation (record it, upload a file, or take
 * a sample), name the visit, then create the note.
 *
 * Consent is asked for in a dialog at the moment it is needed: before the
 * microphone starts, or before a file or a sample is sent. It is asked once
 * per visit. Without a yes nothing is recorded or sent, and the API refuses to
 * process a visit that has none.
 *
 * The form stays on screen while the recording uploads, so that cancelling or
 * a refusal brings it back as it was. Once the API starts answering, the
 * browser moves to the visit's own page, which shows the result arriving.
 */
export function NewVisitForm() {
  const { state: runState, start, retry, abandon, clear } = useProcessRun();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const focusFirstError = useRef(false);
  // Parts of this form replace each other, and the control that was just used
  // disappears with its part. This names where the focus should go next.
  const focusNext = useRef<'preview' | 'source' | 'submit' | null>(null);

  const [consent, setConsent] = useState(false);
  const [consentRequest, setConsentRequest] = useState<ConsentRequest | null>(null);
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
    focusNext.current = 'preview';
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

  const record = (): void => {
    clearError('audio');
    recorder.start();
  };

  const createNote = (input: NewVisitInput): void => {
    setErrors({});
    setTitle(input.title);
    setStartedHere(true);
    start(input);
  };

  const startRecording = (): void => {
    if (consent) {
      record();
    } else {
      setConsentRequest({ for: 'recording' });
    }
  };

  const confirmConsent = (): void => {
    const request = consentRequest;
    setConsent(true);
    setConsentRequest(null);
    if (request?.for === 'recording') {
      record();
    } else if (request?.for === 'note') {
      createNote(request.input);
    }
  };

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) {
      return;
    }
    const element = {
      preview: () => previewRef.current,
      source: () => formRef.current?.querySelector<HTMLElement>('input[name="source"]:checked'),
      submit: () => submitRef.current,
    }[target]();
    if (element !== null && element !== undefined) {
      focusNext.current = null;
      element.focus();
    }
  });

  // After a failed submit, put the cursor where the first problem is.
  useEffect(() => {
    if (focusFirstError.current) {
      focusFirstError.current = false;
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors]);

  // Audio that has not been uploaded exists only in this tab: warn before a reload or a closed tab loses it.
  const unsaved = audio !== null || recorderBusy;
  // A link inside the app gives no such warning by itself. Once the recording is
  // on its way to the API it is safe to leave: the run carries on without this page.
  const uploadingHere = startedHere && runState.phase === 'running';
  useLeaveWarning(
    unsaved && !uploadingHere
      ? 'The recording on this page has not been turned into a note yet. Leave and discard it?'
      : null,
  );
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
    const checked = validateNewVisit({ audio, title, recording: recorderBusy });
    if (!checked.ok) {
      focusFirstError.current = true;
      setErrors(checked.errors);
      return;
    }
    if (consent) {
      createNote(checked.data);
    } else {
      setErrors({});
      setConsentRequest({ for: 'note', input: checked.data });
    }
  };

  if (startedHere && runState.phase !== 'idle') {
    return (
      <RunProgress
        state={runState}
        onRetry={retry}
        onBack={() => {
          focusNext.current = 'submit';
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
            ref={previewRef}
            audio={audio}
            onRemove={() => {
              focusNext.current = 'source';
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Button ref={submitRef} type="submit" className="h-11 px-5 text-base">
          Create note
        </Button>
        {consent && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Check aria-hidden className="size-4" />
            Consent confirmed for this visit
          </p>
        )}
      </div>

      <ConsentDialog
        open={consentRequest !== null}
        onConfirm={confirmConsent}
        onCancel={() => {
          setConsentRequest(null);
        }}
      />
    </form>
  );
}
