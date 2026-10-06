import { SessionPanel } from '@/components/session-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

/** A stand-in home page that exercises the design system and the session. The landing page replaces it. */
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <span className="text-lg font-semibold tracking-tight">Attune AI</span>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 flex-col gap-10 py-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold">From conversation to clinical note</h1>
          <p className="max-w-prose text-lg text-muted-foreground">
            Record a short consultation and get a transcript and an editable SOAP note.
          </p>
        </div>

        <SessionPanel />

        <section aria-labelledby="buttons-heading" className="space-y-4">
          <h2 id="buttons-heading" className="text-sm font-medium text-muted-foreground">
            Buttons
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-sm text-muted-foreground">
        Demo only, for synthetic data. Built with HIPAA-style safeguards; not a medical device.
      </footer>
    </div>
  );
}
