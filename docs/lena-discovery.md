# Juniper Salon: customer discovery reference

Source: Lena's 50-turn assessment conversation, supplied by the assessment participant on October 8, 2026. This document summarizes her answers; proposed implementation choices belong in `prototype-proposal.md`.

## People and current process

- Lena owns and operates a neighborhood hair salon. Lena and Carla at the front desk manage cancellations and contact clients from the salon phone. They have the same responsibilities and can manage any opening. Stylists report availability changes.
- Clients ask staff for an earlier appointment. Staff add them to a Google Sheet containing name, mobile number, requested service, preferred stylist, and general availability.
- Staff currently sometimes text several eligible clients at once. Competing acceptances have led to two clients believing they had the same Saturday haircut, leaving one angry.
- During busy periods, staff lose track of contacts, declines, and response time. They miss contacting the next person and leave the chair empty.
- Staff maintain the actual booking calendar in Square themselves, including changing or canceling the client's original appointment.

## Desired business outcome

Lena wants to refill at least half of last-minute cancellations without staff repeatedly checking the process. Her highest priority is reliably moving to the next person without double-booking. This is a target for a future pilot, not a result established by a prototype.

## Opening and candidate review

- Staff enter the opening's service, stylist, date, time, and available duration.
- Eligibility requires matching service, availability that includes the appointment date/time, any required stylist, and a service duration that fits. Salon services range from 30 minutes to three hours.
- A shorter service may fit an opening if service and stylist requirements still match. Lena has not supplied a service compatibility catalog or concrete service durations.
- A client requiring a particular stylist must not receive an offer with another stylist. A client without that requirement can receive another stylist.
- Eligible candidates are ordered by when they joined the waitlist, earliest first. No VIP, urgent, or other separate priority category exists.
- Before outreach, Lena or Carla must review the opening details and client availability. They can remove unsuitable candidates. Sending starts only after approval.
- No additional special cases are currently defined.

## Offer and response rules

- Contact one eligible client at a time. The desired response window is 15 minutes; Lena explicitly described this for same-day openings.
- Clients receive an offer on their phone, likely through text or a simple mobile page. It shows service, stylist, date, time, and clear accept/decline choices.
- Acceptance holds/fills the opening, stops further offers, and notifies the client and front desk. The first confirmed acceptance wins; competing attempts see that the opening is unavailable.
- Decline records that outcome and automatically advances to the next eligible client. Declining does not remove the client from the waitlist.
- No response by the deadline records a timeout and automatically advances.
- A message that cannot be delivered records a visible failure and advances to the next eligible client.
- A client can be eligible for several openings until accepting one. Acceptance removes them from the waitlist; they must not subsequently claim another opening from that waitlist entry.
- A client can also ask to leave the waitlist.
- Stop when an opening becomes unavailable or all eligible candidates have been tried without an acceptance.

## Staff control and exceptions

- Staff create openings, approve candidates, monitor progress, and cancel an opening immediately when it becomes unavailable. Pending offers then show unavailable, and no further clients are contacted.
- Incorrect details are corrected by canceling and creating a new opening. Editing an active offer is unnecessary.
- After acceptance, a client can contact staff to change their mind. Staff handle cancellation and the real calendar change. Lena did not specify automatic reopening or automatic waitlist re-enrollment.
- Staff can end an offer if the opening changes. Whether response windows can be extended or shortened remains undecided.
- Quiet hours are not defined. Staff must explicitly decide whether to proceed with outreach; the system must not guess reasonable hours.
- After an interruption, offers must not be lost or duplicated. Staff need to see whether an offer was accepted, declined, or timed out once service resumes.

## Visibility

Staff need the current offer holder, earlier declines/timeouts, remaining candidates, final outcome, and a timestamped history of who received an offer and whether it was accepted, declined, timed out, or failed delivery.

## Demonstrations Lena requested

1. Match a normal opening to the earliest eligible client.
2. Show a decline or timeout automatically advancing to the next person.
3. Show competing acceptance attempts with only the first valid confirmed acceptance succeeding.

## Boundaries and details still undefined

- Square integration is explicitly unnecessary for the prototype.
- Lena accepts a mobile offer page; real SMS delivery is not established as required prototype scope.
- Exact quiet hours, service catalog, stylist roster, availability format, and actual client data were not supplied.
- Lena has not decided whether staff need adjustable response windows.
- Her competing-acceptance scenario must be reconciled with sequential offers: an expired prior offer must never beat the currently eligible offer, even if its reply arrives first.
- Discovery is complete at 50 turns. Resolve remaining prototype details as explicit assumptions rather than attributing them to Lena.
