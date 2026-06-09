# Enhancements — overnight session

All changes below are **local only** until you push. The production build was verified to compile cleanly under `CI=true` (the strictest setting Amplify can use).

## Bug fixes (robustness — Week 3 "error handling" rubric)

- **Fixed the AI-error display bug.** Previously, when an analysis failed, the app stored an error object but still tried to render it as a *success*, showing blank fields and an empty score bar. Now a failed analysis shows a clear "⚠ Couldn't reach the AI just now — Try again" card with a retry button.
- **Guarded every place that reads AI output** (row badge, score number, progress bar, "Log Send" button, member modal insight) so a failed analysis can never render broken/`undefined` data or let you log a message that wasn't generated.
- **Friendlier error copy** — replaced the misleading "check API key" message (the key is fine; it's server-side) with a plain, accurate one.

## Accessibility (bonus points)

- **Escape key closes** the member detail dialog.
- The dialog now uses `role="dialog"`, `aria-modal`, and an `aria-label`; the close (×) button has an `aria-label`.
- **Toasts** are a polite `aria-live` region, so confirmations are announced to screen readers.
- **Filter pills** have `aria-label` + `aria-pressed`; the new search box is labeled.

## New functionality

- **Member search** — a search box on the Dashboard filters the roster by name (works together with the risk filter).
- **CSV export** — one-click export of the member list (respects the current filter/search) and of the outreach log, for owners who want the data in a spreadsheet.
- **Empty states** — the Dashboard now shows a friendly message when no members match the current filter/search.

## Honesty & cleanup

- Header now shows the **real member count** (`{members.length}`) instead of a hardcoded "150 active members."
- Removed dead code (`useCallback` import, unused `setMembers`) that would fail a `CI=true` build.

## Verification

- `CI=true npm run build` → **Compiled successfully.** No warnings, no errors.
