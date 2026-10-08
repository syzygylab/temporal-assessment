# Prototype verification — October 8, 2026

Follow-up: the five-minute hardening audit added two business-rule regressions and one HTTP boundary test. All 11 tests passed after the changes; see `submission-audit.md` for the current submission checklist.

## Passed

- TypeScript compilation check: `npm run typecheck`.
- Six business-rule tests: `npm test`.
- Two real Temporal integration scenarios: `npm run test:temporal` (combined run: approximately 37 seconds).
- JavaScript syntax checks for browser code and the development launcher.
- Git whitespace check.
- Final `npm run dev` restart, including recreation of Temporal with localhost-only port bindings. Saved salon state remained available afterward.

Integration scenarios exercised actual Activity execution and timers, including permanent delivery failure, automatic timeout progression, declined offers, exhaustion, stale acceptance rejection, concurrent claims by one client across two openings, and cancellation. The recovery scenario stopped the Worker while an offer was pending, waited past its deadline, restarted a Worker on the same queue, and verified the same offer ID/deadline, one expired offer, and one new offer for the next client.

## Browser walkthrough

Using the actual local website:

1. Created a Haircut/Maya opening and saw three eligible clients in earliest-joined order, with five excluded clients and reasons available.
2. Explicitly approved contact; Nina received the first offer.
3. Declined Nina's offer and observed Eli become the current offer holder automatically.
4. Inspected Eli's offer at a 390 × 844 mobile viewport, then accepted.
5. Verified the client's confirmed result and staff's filled outcome with Nina's decline, Eli's acceptance, and the manual Square reminder.
6. Verified Nina remained active and Eli became accepted on the waitlist.
7. Added fictional client Avery Lane using the waitlist form and verified the saved entry.

Screenshots are in `evidence/`. The real Temporal execution shows Workflow Updates, delivery Activities, and durable timers. Its running status is expected because it coordinates future openings too.

## Limits of this evidence

The tests establish prototype behavior, not the future 50% refill outcome. Messaging is simulated; no SMS provider, Google Sheets, or Square integration was tested. Production authentication, external calendar conflict detection, and long-running history management remain outside scope. Fresh-install dependency bootstrapping is implemented in the startup script; the runtime checks used installed dependencies on this machine.
