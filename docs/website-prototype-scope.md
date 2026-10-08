# Juniper Salon website prototype scope

Status: implementation scope derived from [customer discovery](lena-discovery.md) and [prototype proposal](prototype-proposal.md). The website has not been implemented.

## Goal and constraints

Build a locally runnable website that helps Lena and Carla refill canceled appointments through reviewed, sequential offers. Demonstrate automatic progression, one confirmed winner, and recovery after a Worker interruption. Aim for the assessment's approximately 35-minute development allocation; prioritize the core process over additional features. Track the 50% refill target as a future pilot outcome, not a prototype claim.

Keep the existing Express, TypeScript, vanilla browser interface, local Temporal service, and Worker. Use a calm salon aesthetic, readable typography, clear status labels, and responsive layouts. No public deployment.

## Website surfaces

### 1. Front-desk dashboard: `/`

Primary workspace for both Lena and Carla; no role differences or login in this local demonstration.

- Navigation to openings, waitlist, and a clearly labeled demo inbox.
- Opening cards show service, stylist, appointment date/time, status, and current offer holder when applicable.
- Filters for all, awaiting review, in progress, and finished.
- A create-opening action opens a compact form for service, stylist, start date/time, and available duration.
- Empty state explains how to create the first opening; seeded waitlist data makes the initial demo ready to use.
- Finished cards distinguish filled, canceled, appointment time reached, and exhausted candidates.
- Any summary counts describe prototype records only. Do not imply measured business improvement.

### 2. Opening review and detail: `/openings/:openingId`

Before approval:

- Display opening details and matching rules.
- Eligible candidates show name, join order, requested service, required stylist or any stylist, service duration, and availability window.
- Show excluded candidates with concrete reasons.
- Staff can remove a candidate from this opening without removing them from the waitlist.
- Require explicit approval of the reviewed list and confirmation that outreach should begin now. Do not enforce invented quiet hours.
- If no candidates qualify, explain why and leave outreach unavailable.

After approval:

- Display current offer holder, absolute deadline, presentation countdown, remaining candidates, and timestamped event history.
- History distinguishes approved, offered, declined, expired, delivery failed, accepted, canceled, and skipped because eligibility changed.
- Provide an immediate cancel action with a brief confirmation describing its effect.
- On acceptance, show the winner and manual Square checklist: book the earlier appointment and change/cancel the original appointment.
- Permit recording a post-acceptance cancellation separately; preserve the winner/history and do not automatically reopen or re-enroll the client.
- Offer corrections through cancel-and-recreate rather than editing an active appointment.

### 3. Mobile client offer: `/offers/:offerToken`

- Show Juniper Salon, service, stylist, appointment date/time, duration, and response deadline.
- Large accept and decline buttons with pending request states.
- Show success only after the Workflow returns a committed decision.
- Render confirmed, declined, expired, canceled, delivery failed, or unavailable states without leaving active buttons behind.
- Reopening a winning link or repeating acceptance returns the same confirmation.
- Reopening another completed offer shows its final outcome. A client accepting another opening invalidates this offer.
- If confirmation cannot be obtained, explain that it has not been confirmed and allow retry. Never infer a booking from a browser click.
- Offer tokens identify specific offers and are checked server-side. Tokens and access controls are demonstration-level; secure access is required before a real pilot.

### 4. Waitlist view: `/waitlist`

- Seed fictional clients containing both qualifying and nonqualifying examples.
- List name, synthetic mobile number, service, stylist requirement, availability, join time, and active/removed/accepted status.
- Allow adding an entry with those fields and removing an active entry at the client's request.
- Preserve entry order and history; do not provide arbitrary priority reordering.
- A decline retains membership. An acceptance ends eligibility across all openings.
- Use explicit date/time windows rather than interpreting free-text availability.

### 5. Demonstration inbox: `/demo`

- Clearly label all messages as simulated; no real texts are sent.
- Show outbound offers with client names, opening details, delivery result, and links to mobile offer pages.
- Show simulated client and staff acceptance notifications.
- Allow a fictional candidate's next delivery to fail for a failure demonstration.
- Allow selecting a 20-second demo response window when creating an opening. Normal mode remains 15 minutes; show the selected mode throughout the offer flow.
- Keep diagnostic controls separate from normal staff actions. A Worker interruption demonstration uses the local process, not a fake browser toggle.

These surfaces may use client-side navigation served by Express; they do not require a new frontend framework. Staff details and review share one page to reduce implementation work.

## Core data and ownership

The salon coordinator Workflow owns all authoritative business state. Express forwards commands and reads queries; it must not maintain an independent booking map in memory. Browser state is disposable.

| Record | Essential fields |
| --- | --- |
| Waitlist entry | ID, name, synthetic mobile, service, service duration, required stylist or any, availability start/end, joined-at, membership status |
| Opening | ID, service, stylist, start, available duration, response window, approved candidate IDs, staff exclusions, phase, winner, manual calendar status |
| Offer | ID/token, opening ID, client ID, delivery status, activated-at, expires-at, outcome |
| History entry | Event ID, opening ID, optional offer/client ID, event type, timestamp, readable detail |
| Message record | Idempotency key, offer/opening/client ID, message kind, simulated result |

Use a fictional service catalog and stylist roster. Exact service match and fitting service duration are the first version's matching rules. Availability must cover the full service interval. Use the salon's explicit timezone for display and convert inputs to absolute timestamps; label it and avoid relying on the evaluator's machine timezone.

Approved candidate IDs form a fixed queue. Recheck membership before every offer and acceptance. New entries do not silently change an approved list.

## Temporal process

Opening phases: `review`, `offering`, `filled`, `canceled`, `exhausted`, `appointment_passed`, and `canceled_after_acceptance`.

Offer phases: `sending`, `pending`, `accepted`, `declined`, `expired`, `delivery_failed`, and `unavailable`.

1. Create an opening and calculate a candidate preview.
2. Approval commits the reviewed queue and requests delivery to the first eligible client.
3. The delivery Activity uses a stable key and bounded retries. Once delivery succeeds and the opening is still active, activate the offer and establish its deadline.
4. Wait durably for a response, cancellation, membership change, or deadline.
5. Decline, expiry, or final delivery failure records history and advances automatically.
6. Acceptance validates the live offer and deadline, commits the winner, removes client eligibility, and invalidates that client's other pending offers in one synchronous decision.
7. Queue confirmations after committing the winner. A confirmation-delivery failure is visible and does not reopen the appointment.
8. Stop at a final outcome or appointment start. Appointment start bounds any remaining offer window.

Updates that change eligibility or claims must not await Activities between checking and committing state. The processing loop performs external work and rechecks state after it completes. The timer loop checks the nearest offer or appointment deadline. Browser polling never drives progress.

Keep the salon Workflow running so it can manage subsequent openings. Its running Temporal status differs from an individual opening's completed business status; explain this in evidence and the presentation.

## Browser/API contract

Exact route names can change during implementation; the following operations are required.

| Operation | Purpose |
| --- | --- |
| GET salon view | Dashboard openings, waitlist, and simulated inbox |
| POST waitlist entry | Add a validated synthetic entry |
| POST remove entry | End eligibility and invalidate pending offers |
| POST opening | Validate fields and create review state |
| GET opening | Review candidates or monitor current progress |
| POST approve opening | Commit staff exclusions, reviewed candidates, and explicit outreach consent |
| POST cancel opening | Stop pending outreach or record post-acceptance cancellation |
| GET offer | Return only the client-facing offer fields and current outcome |
| POST offer response | Accept or decline and return the committed result |
| POST demo delivery setting | Configure an explicitly simulated delivery failure |

Commands carry stable request IDs for retry deduplication. Distinguish invalid input, missing records, stale/unavailable offers, and temporarily unavailable service. Disable duplicate submissions while pending without depending on that UI protection for correctness. Validate input again on the server and at Workflow decision boundaries.

## Definition of done

- Review is required before delivery; staff exclusions are respected.
- Service, stylist, full availability interval, duration, and earliest-joined ordering determine candidates correctly.
- Decline, timeout, and failed delivery each advance without staff action.
- At most one valid acceptance fills an opening. Stale offers cannot win, and duplicate winning requests return the original confirmation.
- A client cannot accept two openings from the same waitlist entry.
- Cancellation prevents new valid offers/acceptances; late delivery completion cannot reactivate the opening.
- A Worker restart preserves state, history, and absolute deadlines; expired offers are handled when processing resumes.
- Staff can understand each opening's current and final state. Client pages accurately reflect committed outcomes.
- Core pages work on desktop and narrow mobile widths, use labeled inputs, keyboard-operable controls, and readable status/error messages.
- Workflow tests cover races, expiry, cancellation, matching, and cross-opening eligibility. Browser checks cover the normal review-to-confirmation flow.
- README explains prerequisites, one-command startup, demonstration modes, and excluded integrations.
- Actual Temporal Web UI evidence is saved under `evidence/`; four presentation slides are delivered as a PDF.

## Build priority and time budget

| Order | Work | Approximate development budget |
| --- | --- | --- |
| 1 | Shared data, fictional fixtures, coordinator Workflow, delivery Activities, essential tests | 12 minutes |
| 2 | API and staff create/review/monitor/cancel flow | 10 minutes |
| 3 | Mobile responses, simulated inbox, basic waitlist controls | 7 minutes |
| 4 | Verification, responsive polish, README, evidence capture | 6 minutes |

This is an aggressive target, not a guarantee. If time becomes tight, simplify filters, visual decoration, and demo controls first. Preserve review approval, automatic progression, acceptance correctness, cancellation, and truthful simulation labels. Use the separately allocated presentation time for the PDF.

## Explicit exclusions and future pilot

Exclude real SMS delivery, Google Sheets synchronization, Square integration, public deployment, production accounts/permissions, automatic quiet hours, adjustable live response windows, and multi-salon scale. Exclude automatic reopening after a confirmed client cancels.

For a practical pilot, add secure client links and staff access, agree on the real service/availability rules, connect a messaging provider with deduplicated delivery, and observe actual openings under staff supervision. Measure refill rate, time saved, missed progression, and conflicting confirmations against Lena's target.
