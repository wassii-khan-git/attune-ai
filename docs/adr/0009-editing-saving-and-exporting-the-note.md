# ADR 0009: Editing, saving and exporting the note

- Status: Accepted
- Date: 2026-10-07

## Context

The note a model drafts is a starting point. A clinician reads it against the transcript, corrects it, and takes it somewhere else: into a record system, or onto paper. The visit page has to make that safe and quick.

Three things shape the design:

- An edit must never be lost. A draft is cheap to regenerate; a paragraph someone wrote by hand is not.
- The note is sensitive text. It is encrypted at rest on the server (ADR 0005) and must not be copied into places that are not.
- The page also shows a visit while it is being created. The run starts on the new-visit page (ADR 0008) and its result arrives as a stream (ADR 0003).

## Decision

**The note is saved as it is typed.** There is no save button to forget. A save goes out when typing pauses for a second, when a field is left, and when the page is left by a link. The page always shows where things stand: saved, unsaved, saving, or not saved and why.

**One save at a time, always the newest text.** While a save is in flight, later edits wait and go out together when it returns. An older save can therefore never arrive after a newer one and overwrite it. Each save sends the whole note, which is what the API accepts.

**A failed save loses nothing.** The text stays on the page, the reason is shown, and the save is tried again every ten seconds where that can help: a lost connection, a server error. Where it cannot help (the visit was deleted, the session ended, the visit is being processed) the page says so and stops trying. The browser warns before a reload or a closed tab discards unsaved text.

**Unsaved text lives in the page's memory only.** It is not mirrored into `localStorage` or IndexedDB.

**The run lives above the pages.** The request that creates a note belongs to a provider around the signed-in app, not to the page that started it. The form stays on screen while the recording uploads, so cancelling brings it back as it was. When the API starts answering, the browser moves to the visit's page, which shows the transcript and then the note being written. When the run is done the note becomes editable in place.

**A visit page trusts the run only while it watched it happen.** If the page opens after the run has finished, it loads the visit from the API, because the run still holds the note as first drafted and edits may have been saved since.

**Model output is shown as text.** The transcript and the note are rendered as plain text nodes, never as markup.

**Copying produces plain text.** The title, then each section under its heading. A blank section is written as "Not discussed", the same wording the model uses.

**PDF export is the browser's print dialog.** A print stylesheet leaves only the title, the date, the note and the disclaimer on the page, in black on white whatever theme is on screen. Each text area is replaced by its text, because a text area prints as a clipped box.

**Deleting takes two clicks,** and the second one is not where the focus lands.

## Alternatives considered

- **A save button.** Familiar, and the surest way to lose work: it depends on the user remembering it.
- **Keeping a draft in browser storage** so that a crash or reload loses nothing. It would put note text in an unencrypted store that outlives the session, on a machine that may be shared.
- **Saving one section at a time.** Smaller requests, and two sections edited in two tabs would not collide. The API would need a partial update, and the saving is negligible at this size.
- **Refusing a save that is based on an older version** (a version number or `If-Match`). The right answer if several people edit one note. Here a note has one author, so it is recorded as a known limit below.
- **Generating the PDF with a library, in the browser or on the server.** Full control over the layout, at the cost of a large dependency or of rendering patient text on a server. The print dialog is already on every device and also prints.
- **Keeping the run in the page that started it** and showing the result there. The visit page would then need a second copy of the same view for visits opened later.

## Consequences

- An edit is on the server about a second after typing stops, and the user never has to think about it.
- If the same note is open in two tabs, the tab that saves last wins for the whole note. Nothing warns about it.
- Text typed while offline survives as long as the tab stays open. Closing the tab, with the warning, discards it.
- A sign-out for inactivity also discards text that could not be saved. The idle limit is fifteen minutes without input, so this needs a save that has been failing for that long.
- Opening a visit writes one audit row and decrypts the note, so the page does not poll. A visit that is still being processed elsewhere shows a "Check again" button.
- A visit whose run failed cannot be processed again from its page. Recordings are never stored, so the user starts a new visit.
- The exported PDF is whatever the browser's print dialog produces. Headers and footers the browser adds are under the user's control, not the app's.
