# Five-minute submission audit — October 8, 2026

## Submission checklist

| Criterion | Audit result |
| --- | --- |
| New public repository, not a fork | Independently verified through the GitHub repository API during final review: `syzygylab/temporal-assessment` has `private: false` and `fork: false`. |
| README with one-command run | Present: `npm run dev`, prerequisites, first-install behavior, ports, demo walkthrough, and exclusions. Launcher successfully ran locally. |
| Temporal Web UI screenshot in evidence/ | Present: `evidence/temporal-workflow.jpg`, with Workflow ID, running status, Activities, Updates, and timers. |
| 3–5 slide PDF | Completed after this audit: `output/pdf/juniper-salon-proposal.pdf` contains five standalone customer-facing slides. |
| Local execution, no public deployment | API and Docker port mappings bind to localhost. |
| Repository delivery | Delivery target is `origin/main`. After pushing, verify the remote branch matches local HEAD; the final delivery result is recorded in the assessment chat. |

## Customer criteria

Implemented: eligibility by service, required stylist, full availability, and duration; earliest-joined ordering; staff approval/exclusions; sequential offers; normal 15-minute and labeled 20-second demo deadlines; decline/timeout/failure progression; one confirmed opening per client entry; stale-link rejection; cancellation; timestamped history; manual Square handoff; restart recovery; simulated phone offer pages.

## Hardened during this audit

1. Approval captures the eligible client IDs when staff confirm their review. If membership changes before the command is committed, the Workflow rejects approval and asks staff to review again. New API approvals must supply this snapshot; historical Workflow commands remain replay-compatible.
2. Out-of-range timestamps are rejected before they can break date rendering.
3. Invalid response choices, malformed JSON, and oversized requests return clear client errors instead of being mislabeled service outages.
4. A declined client's page and repeated decline response no longer promise active waitlist membership after that client has been removed or accepted elsewhere.

## Verification

Final pre-push review reconfirmed the public non-fork repository, five-page PDF, required evidence, clean whitespace checks, TypeScript checks, eight business-rule tests, browser JavaScript syntax, and the HTTP boundary test. The Temporal integration results below were obtained after the hardening changes.

- TypeScript and browser JavaScript syntax checks passed.
- Eight business-rule tests passed, including two new regression tests for stale review and invalid dates.
- Two real Temporal integration/recovery tests passed after the changes.
- One HTTP boundary test passed against the restarted local app (malformed JSON, invalid response, missing review snapshot, invalid date, and a successful state read).
- The hardened API and Worker are running locally. Existing salon execution state remains intact.

## Deliberate limitations

Real SMS, Square/Google Sheets integration, production authentication, cross-checking the complete stylist calendar, and long-running history management remain excluded and documented. The prototype cannot establish the 50% refill business outcome; that requires a supervised pilot. Existing evidence was captured before these validation fixes; its illustrated successful behavior is unchanged.
