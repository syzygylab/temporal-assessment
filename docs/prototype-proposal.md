# Juniper Salon: draft prototype proposal

Status: design draft, not implemented. Customer source: [Lena discovery reference](lena-discovery.md).

## Product promise

Give Lena and Carla a simple front-desk view that offers a canceled appointment fairly, advances without reminders, and records one confirmed winner. A mobile offer page gives clients an unambiguous accept or decline response.

## Proposed staff experience

1. **Create an opening.** Select service, stylist, appointment start, and available duration. Use synthetic salon data with visible joined-at ordering and availability windows.
2. **Review matches.** Show eligible clients in waitlist order, why they match, their availability and required duration. Explain exclusions such as wrong stylist, unavailable time, or insufficient duration. Staff can exclude an unsuitable candidate but cannot silently reorder the queue.
3. **Approve outreach.** Require an explicit confirmation that the details and candidates have been reviewed and staff want to contact clients now. This implements Lena's judgment about contact hours without inventing quiet hours.
4. **Monitor progress.** Show appointment details, current client, remaining response time, remaining candidates, timestamped history, and a prominent cancel action. Outcomes include filled, canceled, appointment time reached, and no eligible candidates remaining.
5. **Finish booking manually.** After acceptance, show the winner and a clear reminder to update Square and change the original appointment. A prototype acceptance is a confirmed hold in this process, not evidence that Square was updated.

Provide a small waitlist view for adding synthetic clients and removing an entry at their request. Existing approved candidates who subsequently leave or accept another opening must be skipped. Newly added clients are considered for future reviews; an approved queue remains a snapshot.

## Proposed client experience

Each offer has its own mobile-friendly URL showing service, stylist, date, time, duration, deadline, and accept/decline buttons. It displays confirmed, declined, expired, canceled, or unavailable after the offer ends. A stale page or repeated click cannot create a new booking. Staff can open these links from a clearly labeled simulated message inbox.

## Temporal design

For this small prototype, use one durable **Juniper salon coordinator Workflow** to own waitlist membership, openings, offer deadlines, and confirmed claims. Keeping these decisions together gives one place to check both appointment availability and whether a client already accepted another opening. This also supports Lena's request that a client can receive offers for several matching openings while remaining limited to one acceptance.

The browser calls Express; Express sends commands to the Workflow and queries its current state. Browser polling refreshes the display only. The API and browser do not own the queue or expiration logic.

- **Workflow Updates** handle adding/removing waitlist entries, creating openings, approving a reviewed queue, accepting/declining, and canceling. An Update returns the committed business result, allowing the page to say confirmed only after the acceptance decision succeeds.
- **Synchronous decision handlers** validate and change shared state without awaiting external work between checking eligibility and recording a claim. Accept checks the offer token, current offer status, deadline, opening status, and client's active waitlist membership. It then records the winner, removes the client from eligibility, and invalidates their other pending offers together.
- **Durable timers** drive offer expiry. The coordinator waits for changes or the earliest active deadline, records expired offers, and schedules the next eligible candidate. Store absolute deadlines so restarting a Worker does not grant another 15 minutes.
- **Queries** expose staff and client views, including business history and outstanding manual calendar work.
- **Activities** simulate message delivery and staff/client notifications. Use bounded retries for transient delivery errors; a permanent failure or exhausted retries records failed delivery and advances. Notification failure after acceptance must not undo the winner or offer the opening again.
- **Stable request and offer IDs** make retried commands and delivery attempts identifiable. Activities must honor an idempotency key; Temporal retries alone do not guarantee that a real SMS provider sends exactly once.

Keep each opening's transitions and history distinct inside the salon Workflow. The Temporal Web UI evidence will show this coordinator's actual Updates, Activities, and timers. A production design would add history management with Continue-As-New or divide ownership with a durable claim service; that is outside the assessment prototype.

Technical references: [Workflow messages](https://docs.temporal.io/encyclopedia/workflow-message-passing), [handler concurrency](https://github.com/temporalio/documentation/blob/main/docs/encyclopedia/workflow-message-passing/handling-messages.mdx), [TypeScript durable timers](https://github.com/temporalio/documentation/blob/main/docs/develop/typescript/workflows/timers.mdx).

## Important edge cases

- Sequential outreach means only the current unexpired offer can win a particular opening. An expired client's early click is rejected even if the next client's acceptance arrives later.
- Duplicate clicks for a winning offer return the same confirmation. Other stale or competing requests receive an unavailable result.
- A client receiving offers for two openings can accept only one. Their other offer is invalidated and that opening advances to its next candidate.
- Cancellation and acceptance are decided in Workflow processing order. If cancellation is committed first, acceptance fails. If acceptance is committed first, staff see that it is already filled and use a separate post-acceptance cancellation action, recorded in history; no automatic reoffering follows.
- Delivery completion after cancellation must not activate an offer or schedule another candidate. A message already handed to a provider may still arrive; its response page must show unavailable.
- Stop contacting clients when the appointment begins. Reject openings in the past and candidates whose required duration extends outside their availability. These are proposed practical defaults, not additional answers from Lena.
- If only the Worker stops, Temporal retains state and deadlines; overdue transitions run when the Worker resumes. If the API or Temporal service is unreachable, show that confirmation is unavailable and avoid claiming success. An acceptance counts only once the Workflow confirms it before its deadline.

## Assessment scope and assumptions

Use exact service matches, explicit required stylist or any stylist, and concrete availability start/end windows. Seed durations and people are fictional. Preserve earliest-joined order after eligibility checks. Use a deterministic ID tie-break if joined times match.

The normal offer window is 15 minutes. Offer a prominently labeled demo mode with a short window, such as 20 seconds, so a real Temporal timeout can be demonstrated within the assessment. Do not replace the server timer with a browser countdown.

Simulate outbound SMS and confirmation notifications with Activities and an in-app inbox. Exclude live SMS, Google Sheets synchronization, Square updates, production authentication, and automatic quiet-hour rules. Authentication and secure offer-link management are prerequisites for a real pilot.

## Verification and demo sequence

1. Review a fixture containing both eligible and excluded clients; approve and show the earliest eligible client receiving the first offer.
2. Decline; verify automatic progression and retained waitlist membership.
3. Allow the next offer to expire in demo mode; verify a genuine Temporal timer and automatic progression.
4. Submit duplicate/concurrent accept requests; verify one winner, no second claim, and truthful client results. Also test a stale prior link against the current offer.
5. Give one client offers for two openings; accept one and verify the other offer is invalidated and advances.
6. Cancel a pending opening; verify no later acceptance or outreach succeeds.
7. Simulate failed delivery; verify visible failure and progression. Restart the Worker during a pending offer; verify its deadline and history survive.

Automated Workflow tests should cover the claim races, deadline checks, cancellation, cross-opening eligibility, and delivery failures. Verify the normal staff/client path in the browser and capture real Temporal Web UI evidence.

## Deliverables and next step

- Replace the starter demo with the staff dashboard, review flow, waitlist view, and mobile offer page.
- Keep one-command local startup instructions in the README, including prerequisites and simulated/excluded integrations.
- Capture a representative Temporal Web UI screenshot under `evidence/` with synthetic data.
- Create four PDF slides: Lena's problem and target; prototype walkthrough; durable behavior and simulations; practical pilot next step.

Propose a staff-supervised pilot after adding secure client access and a real messaging provider. Record canceled openings entered, eligible candidates, offers, fill outcomes, manual intervention, and conflicting confirmations. Evaluate the 50% refill target on real pilot results; a scripted demo cannot establish it.
