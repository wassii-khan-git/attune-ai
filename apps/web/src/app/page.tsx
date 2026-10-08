import { AudioLines, FileText, History, LockKeyhole, Mic, PenLine, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Brand } from '@/components/brand';
import { SiteFooter } from '@/components/site-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AccountDeletedNotice } from '@/features/auth/account-deleted-notice';
import { AuthNav } from '@/features/auth/auth-nav';
import { HeroActions } from '@/features/auth/hero-actions';
import { NotePreview } from '@/features/landing/note-preview';
import { DISCLAIMER } from '@/lib/disclaimer';

type Item = { icon: LucideIcon; title: string; text: string };

const STEPS: Item[] = [
  {
    icon: Mic,
    title: 'Record or upload',
    text: 'Confirm consent, then record up to five minutes in the browser or upload an audio file.',
  },
  {
    icon: FileText,
    title: 'Get a transcript and a draft',
    text: 'See who said what, then watch the note being written: subjective, objective, assessment, plan.',
  },
  {
    icon: PenLine,
    title: 'Review and edit',
    text: 'The note is a draft for you to check. Edit any section, copy it, or export it as a PDF.',
  },
];

const SAFEGUARDS: Item[] = [
  {
    icon: LockKeyhole,
    title: 'Encrypted where it is stored',
    text: 'Transcripts and notes are encrypted field by field before they reach the database.',
  },
  {
    icon: AudioLines,
    title: 'Audio is not kept',
    text: 'A recording exists only for the request that processes it. It is never saved.',
  },
  {
    icon: History,
    title: 'Access is recorded',
    text: 'Each time a note is opened, edited or deleted, an audit entry is written.',
  },
  {
    icon: Trash2,
    title: 'You can delete everything',
    text: 'Delete a single visit, or your whole account, at any time.',
  },
];

function Feature({ icon: Icon, title, text }: Item) {
  return (
    <li className="space-y-3">
      <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon aria-hidden className="size-5" />
      </span>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground">{text}</p>
    </li>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Brand />
        {/* As tall as the link that appears once the session is known, so nothing below moves. */}
        <nav aria-label="Account" className="flex min-h-9 items-center gap-1">
          <AuthNav />
          <ThemeToggle />
        </nav>
      </header>

      <main id="main" className="flex-1">
        <section className="mx-auto grid max-w-5xl items-center gap-x-12 px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
          <div className="max-w-2xl space-y-8">
            <AccountDeletedNotice />
            <Badge variant="secondary">Demo · synthetic data only</Badge>
            <div className="space-y-5">
              <h1 className="text-4xl font-semibold sm:text-5xl">
                From conversation to clinical note
              </h1>
              <p className="text-lg text-muted-foreground sm:text-xl">
                Attune AI records a short consultation, transcribes it with speaker labels, and
                drafts a SOAP note you can edit. It writes down what was said, and marks everything
                else “Not discussed”.
              </p>
            </div>
            <HeroActions />
          </div>
          <NotePreview />
        </section>

        <section aria-labelledby="how-heading" className="border-t bg-muted/40">
          <div className="mx-auto max-w-5xl space-y-10 px-6 py-16 sm:py-20">
            <h2 id="how-heading" className="text-2xl font-semibold">
              How it works
            </h2>
            <ol className="grid gap-10 sm:grid-cols-3">
              {STEPS.map((step) => (
                <Feature key={step.title} {...step} />
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="safeguards-heading" className="border-t">
          <div className="mx-auto max-w-5xl space-y-10 px-6 py-16 sm:py-20">
            <div className="max-w-2xl space-y-3">
              <h2 id="safeguards-heading" className="text-2xl font-semibold">
                Built with care for sensitive data
              </h2>
              <p className="text-muted-foreground">
                The safeguards a clinical tool needs are in place, so you can see how they work.
              </p>
            </div>
            <ul className="grid gap-10 sm:grid-cols-2">
              {SAFEGUARDS.map((safeguard) => (
                <Feature key={safeguard.title} {...safeguard} />
              ))}
            </ul>

            <Alert>
              <AlertTitle>{DISCLAIMER.title}</AlertTitle>
              <AlertDescription>{DISCLAIMER.body}</AlertDescription>
            </Alert>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
