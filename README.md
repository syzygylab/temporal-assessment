# Juniper Salon — an earlier appointment, without the back-and-forth

A local Temporal prototype for Lena and Carla. Review matching clients, approve outreach, and offer a canceled appointment to one person at a time. Declines, timeouts, and failed delivery move automatically to the next eligible client. One valid acceptance holds the opening.

## Run locally with one command

Prerequisites: **Node.js 20+**, **npm**, and **Docker Desktop running with Linux containers**. Ports **3000**, **7233**, and **8233** must be free. Internet access is needed for the first dependency/image download.

From the repository root:

```sh
npm run dev
```

On a fresh clone, this installs locked dependencies with `npm ci`, starts the local Temporal container, and launches the Worker and API. Open **http://localhost:3000** (or http://127.0.0.1:3000). Temporal Web UI: **http://localhost:8233**.

Stop the API/Worker with Ctrl+C. Stop Temporal separately with `npm run stop`; its named Docker volume retains Workflow history. Do not run an old starter Worker at the same time: it shares the assessment task queue and does not know the new Workflow type. The Windows-compatible launcher uses Node directly for its child processes. The lockfile includes a compatible SWC native compiler version.

The app is local-only; it is not publicly deployed. Fonts have system fallbacks if Google Fonts is unavailable.

## Five-minute walkthrough

1. Click **New opening**. Keep Haircut, Maya, and 60 minutes, with a future appointment in the next seven days. All times are explicitly Pacific time.
2. Choose **20 seconds · demo** to demonstrate timeout quickly, or keep the normal **15 minutes**. The demo still uses a real Temporal timer.
3. Review the matches. Nina, Eli, and Sofia are initially eligible in joined order. Expand the excluded list to see service, stylist, and availability mismatches. Uncheck any unsuitable candidate.
4. Confirm the review and decision to contact clients now, then click **Approve & start outreach**. Staff decide contact hours; the app does not guess quiet hours.
5. Open the current client offer in a second tab. Decline and watch the next client appear, or leave the offer alone and let the deadline expire.
6. Accept the next offer. The opening becomes filled, the client leaves the active waitlist, and staff see a reminder to update Square and change the original appointment manually. Mark that work done only after doing it in the real system.
7. Try an old link: it cannot claim the filled opening. Open a winning link twice: it shows the same confirmation.

**Delivery failure:** before approving another opening, visit **Demo inbox** and enable failure for an active candidate. The simulated delivery Activity fails permanently, history records the failure, and the next candidate is contacted. Disable the setting afterward; it persists until changed.

**Cancellation:** cancel an offering opening, then try its old client link. It is unavailable. A confirmed hold uses a separate cancellation action; Square remains manual and the client is not automatically re-enrolled.

**Competing claims:** with the normal 15-minute window, create two openings at different future times matching the same active client. Approve both and try accepting both client offers. Only one succeeds; the other opening advances. For a single opening, only its current unexpired offer is valid, regardless of who clicks a stale link first.

## Tests

```sh
npm run typecheck
npm test
npm run test:temporal
npm run test:api
```

`npm test` runs eight business-rule tests without Docker. `npm run test:temporal` requires the local Temporal service on port 7233 and starts isolated test Workers. It runs actual timer and Worker-restart tests, taking approximately 30–45 seconds. It checks delivery failure, timeout progression, stale acceptance, decline, competing cross-opening claims, cancellation, and preservation of the original deadline after a Worker is stopped and restarted. Test Workflows are terminated after assertions; this is expected cleanup for a long-lived coordinator. `npm run test:api` checks input rejection against the running local website.

## Why Temporal matters here

`salonWorkflow` owns the waitlist, opening queues, offers, deadlines, and history. API processes and browser tabs hold no authoritative booking state.

- **Updates** make staff and client decisions and return the committed result. Synchronous handlers reserve both the opening and the client without an intervening external call.
- **Durable timers** enforce response deadlines and appointment-start cutoffs. Closing the browser does not stop progression. If the Worker is unavailable, overdue transitions resume when it returns, without resetting the deadline.
- **Activities** simulate delivery and confirmations with stable message IDs and bounded retries. Permanent delivery failures advance the queue. Confirmation failure never releases an accepted opening.
- **Queries** serve current views; browser polling refreshes the display only.

One salon coordinator is deliberately small in scope. It remains **Running** in Temporal even after an individual opening is filled. Persistent execution history is in the local Temporal Docker volume. A production design would need history management (such as Continue-As-New), secure access, and a real provider honoring idempotency keys. Temporal does not automatically make external SMS delivery exactly-once.

## Customer rules and deliberate boundaries

- Exact service match, sufficient duration, full availability coverage, and required stylist determine eligibility; earliest joined wins priority. Shorter services fit a longer opening when the service still matches.
- Staff review and exclusions are required before sending. Approved queues are fixed; eligibility is rechecked before offers and acceptance.
- Declining retains waitlist membership. Acceptance or requested removal ends eligibility. A client can receive offers for multiple openings but accept only one from that waitlist entry.
- A confirmed hold is **not** an automatic Square booking. There is no Square or Google Sheets integration.
- All clients and phone numbers are fictional. Outbound texts and front-desk/client notifications are simulated and visible in the demo inbox. No real SMS is sent.
- No login, production access control, automated quiet hours, live offer extensions, or public deployment. Do not enter real personal data.
- Staff remain responsible for entering distinct, genuinely available openings and keeping Square consistent. The prototype does not import the full stylist calendar or detect conflicts with bookings outside this process.
- Pacific timezone, concrete availability intervals, and a fictional service catalog are explicit prototype assumptions.
- Lena's goal is to refill at least half of last-minute cancellations. Prototype counts do not establish that business result.

## Project map and evidence

- `src/domain.ts`: eligibility and synchronous business decisions.
- `src/workflows.ts`: durable coordination, deadlines, and Activity orchestration.
- `src/activities.ts`: simulated delivery adapter.
- `src/api.ts`: Express interface to the Temporal Client.
- `public/`: responsive staff and client screens.
- `tests/`: business rules and real Temporal integration/recovery tests.
- `docs/lena-discovery.md`: customer evidence.
- `docs/prototype-proposal.md` and `docs/website-prototype-scope.md`: proposed design and scope.
- `evidence/`: real Temporal Web UI and prototype screenshots.

For a fresh non-destructive demo, stop the API/Worker, set `SALON_WORKFLOW_ID` to a new unique value, then rerun `npm run dev`. Existing execution history remains available. The new Workflow seeds fresh fictional clients relative to its start date; otherwise the same Workflow and data resume on restart.

Practical next step: a supervised pilot with secure staff/client access and a real messaging provider, measuring refill rate, staff interventions, and conflicting confirmations.

## Presentation for Lena

[Download the five-slide PDF](output/pdf/juniper-salon-proposal.pdf). It covers Lena's problem and goal, the prototype behavior, Temporal recovery, simulated/excluded work, and a proposed supervised pilot. The PDF is standalone and requires no presenter notes or internet connection.

The reproducible PDF source is `scripts/create_presentation.py` (Python with `reportlab` and `pypdf`; not required to run the website).
