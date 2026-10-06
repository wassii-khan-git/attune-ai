import { DISCLAIMER } from '@/lib/disclaimer';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted-foreground">
        {DISCLAIMER.short}
      </div>
    </footer>
  );
}
