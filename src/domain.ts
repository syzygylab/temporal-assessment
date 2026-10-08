import {
  SERVICES,
  STYLISTS,
  type ClientEntry,
  type Command,
  type Opening,
  type Result,
  type SalonState,
} from "./types";

export function seedState(now: number): SalonState {
  const specs = [
    ["Nina Brooks", "Haircut", "Maya"],
    ["Eli Morgan", "Haircut", "any"],
    ["Sofia Chen", "Haircut", "Maya"],
    ["Amara Reed", "Haircut", "Alex"],
    ["Leo Bennett", "Color", "any"],
    ["Isabel Cruz", "Blowout", "any"],
    ["Theo Park", "Haircut", "any"],
    ["Grace Ellis", "Highlights", "Jordan"],
  ];
  return {
    createdAt: now,
    openings: [],
    offers: [],
    messages: [],
    clients: specs.map(([name, service, stylist], i) => ({
      id: `client-${i + 1}`,
      name,
      mobile: `202-555-01${String(i).padStart(2, "0")}`,
      service,
      stylist,
      minutes: SERVICES.find((s) => s.name === service)!.minutes,
      availableFrom: now,
      availableUntil: now + (i === 6 ? 30 * 60_000 : 7 * 86400_000),
      joinedAt: now - (10 - i) * 86400_000,
      status: "active",
      failDelivery: false,
    })),
  };
}
export function matches(state: SalonState, opening: Opening) {
  return state.clients
    .map((client) => {
      const reasons: string[] = [];
      if (client.status !== "active")
        reasons.push(
          client.status === "accepted"
            ? "Already accepted an opening"
            : "Left the waitlist",
        );
      if (client.service !== opening.service) reasons.push("Different service");
      if (client.stylist !== "any" && client.stylist !== opening.stylist)
        reasons.push(`Requires ${client.stylist}`);
      if (client.minutes > opening.minutes)
        reasons.push("Service is longer than the opening");
      if (
        client.availableFrom > opening.startsAt ||
        client.availableUntil < opening.startsAt + client.minutes * 60_000
      )
        reasons.push("Outside availability");
      return { client, reasons, eligible: reasons.length === 0 };
    })
    .sort(
      (a, b) =>
        a.client.joinedAt - b.client.joinedAt ||
        a.client.id.localeCompare(b.client.id),
    );
}
export function record(
  opening: Opening,
  now: number,
  kind: string,
  text: string,
) {
  opening.history.push({ at: now, kind, text });
}
export function closePending(state: SalonState, opening: Opening, now: number) {
  for (const offer of state.offers.filter(
    (o) =>
      o.openingId === opening.id && ["sending", "pending"].includes(o.status),
  )) {
    offer.status = "unavailable";
    offer.respondedAt = now;
  }
  opening.currentOfferId = undefined;
}
const fail = (message: string): Result => ({ ok: false, message });
const good = (message: string, id?: string): Result => ({
  ok: true,
  message,
  id,
});
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const validDate = (value: number) => Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000;

// These synchronous mutations execute inside a Workflow Update. No await can
// interleave a second claim between the checks and the reservation.
export function applyCommand(
  state: SalonState,
  cmd: Command,
  now: number,
): Result {
  if (cmd.type === "addClient") {
    const name = str(cmd.name),
      mobile = str(cmd.mobile),
      service = str(cmd.service),
      stylist = str(cmd.stylist),
      id = str(cmd.id);
    const catalog = SERVICES.find((s) => s.name === service);
    const from = Number(cmd.availableFrom),
      until = Number(cmd.availableUntil);
    if (
      !id ||
      !name ||
      name.length > 80 ||
      !/^[+\d ()-]{7,24}$/.test(mobile) ||
      !catalog ||
      !["any", ...STYLISTS].includes(stylist) ||
      !validDate(from) ||
      !validDate(until) ||
      until <= from ||
      until <= now
    )
      return fail(
        "Enter a name, phone, service, stylist, and valid future availability.",
      );
    if (state.clients.some((c) => c.id === id))
      return good("Client already added.", id);
    state.clients.push({
      id,
      name,
      mobile,
      service,
      stylist,
      minutes: catalog.minutes,
      availableFrom: from,
      availableUntil: until,
      joinedAt: now,
      status: "active",
      failDelivery: false,
    });
    return good("Client added to the waitlist.", id);
  }
  if (cmd.type === "removeClient" || cmd.type === "deliverySetting") {
    const client = state.clients.find((c) => c.id === cmd.clientId);
    if (!client) return fail("Client not found.");
    if (cmd.type === "deliverySetting") {
      client.failDelivery = cmd.fail === true;
      return good("Simulated delivery setting updated.");
    }
    if (client.status !== "active")
      return fail("This entry is no longer active.");
    client.status = "removed";
    invalidateClientOffers(state, client, now, "left the waitlist");
    return good("Client removed. Any pending offers are now unavailable.");
  }
  if (cmd.type === "createOpening") {
    const id = str(cmd.id),
      service = str(cmd.service),
      stylist = str(cmd.stylist),
      startsAt = Number(cmd.startsAt),
      minutes = Number(cmd.minutes),
      responseSeconds = Number(cmd.responseSeconds);
    if (
      !id ||
      !SERVICES.some((s) => s.name === service) ||
      !STYLISTS.includes(stylist) ||
      !validDate(startsAt) ||
      startsAt <= now ||
      !Number.isInteger(minutes) ||
      minutes < 15 ||
      minutes > 240 ||
      ![20, 900].includes(responseSeconds)
    )
      return fail(
        "Choose a future appointment, valid service/stylist, and duration of 15–240 minutes.",
      );
    if (state.openings.some((o) => o.id === id))
      return good("Opening already created.", id);
    state.openings.push({
      id,
      service,
      stylist,
      startsAt,
      minutes,
      responseSeconds,
      phase: "review",
      candidateIds: [],
      excludedIds: [],
      history: [
        {
          at: now,
          kind: "created",
          text: "Opening created. Waiting for staff review.",
        },
      ],
      createdAt: now,
      squareUpdated: false,
    });
    return good("Opening ready for review.", id);
  }
  if (cmd.type === "respond") {
    const offer = state.offers.find((o) => o.token === cmd.token);
    if (!offer) return fail("Offer not found.");
    const opening = state.openings.find((o) => o.id === offer.openingId)!,
      client = state.clients.find((c) => c.id === offer.clientId)!;
    if (cmd.choice !== "accept" && cmd.choice !== "decline")
      return fail("Choose accept or decline.");
    if (
      offer.status === "accepted" &&
      cmd.choice === "accept" &&
      opening.phase === "filled"
    )
      return good("Your appointment is confirmed.", opening.id);
    if (offer.status === "declined" && cmd.choice === "decline")
      return good(client.status === "active" ? "You declined this offer and remain on the waitlist." : "This offer was already declined.");
    if (
      opening.phase !== "offering" ||
      opening.currentOfferId !== offer.id ||
      offer.status !== "pending" ||
      client.status !== "active" ||
      now >= (offer.expiresAt ?? 0) ||
      now >= opening.startsAt
    )
      return fail(
        "This offer is no longer available. No new appointment was confirmed.",
      );
    offer.respondedAt = now;
    if (cmd.choice === "decline") {
      offer.status = "declined";
      opening.currentOfferId = undefined;
      record(
        opening,
        now,
        "declined",
        `${client.name} declined. Moving to the next eligible client.`,
      );
      return good("Offer declined. You remain on the waitlist.");
    }
    offer.status = "accepted";
    opening.phase = "filled";
    opening.winnerId = client.id;
    client.status = "accepted";
    record(
      opening,
      now,
      "accepted",
      `${client.name} accepted. Opening held; staff must update Square.`,
    );
    invalidateClientOffers(state, client, now, "accepted another opening");
    state.messages.push({
      id: `confirmation-${offer.id}`,
      kind: "confirmation",
      openingId: opening.id,
      clientId: client.id,
      text: `${client.name} confirmed ${opening.service} with ${opening.stylist}. Client and front desk notified in this demo. Staff: update Square and the original appointment.`,
      at: now,
      status: "queued",
    });
    return good(
      "Your appointment is confirmed. The front desk will update your booking.",
      opening.id,
    );
  }
  const opening = state.openings.find((o) => o.id === cmd.openingId);
  if (!opening) return fail("Opening not found.");
  if (cmd.type === "approve") {
    if (opening.phase !== "review")
      return fail("This opening has already left review.");
    if (cmd.contactNow !== true)
      return fail(
        "Confirm that you reviewed the candidates and want to contact them now.",
      );
    if (opening.startsAt <= now)
      return fail("This appointment time has passed.");
    const excluded = Array.isArray(cmd.excludedIds)
      ? cmd.excludedIds.filter((x): x is string => typeof x === "string")
      : [];
    const currentIds = matches(state, opening).filter(m => m.eligible).map(m => m.client.id);
    // Optional for replay compatibility with approvals in existing histories.
    // The HTTP API requires a reviewed snapshot for all new staff approvals.
    if (Array.isArray(cmd.reviewedCandidateIds) &&
        JSON.stringify(cmd.reviewedCandidateIds) !== JSON.stringify(currentIds))
      return fail("The candidate list changed. Review it again and reconfirm before sending.");
    const eligible = matches(state, opening).filter(
      (m) => m.eligible && !excluded.includes(m.client.id),
    );
    if (!eligible.length)
      return fail("There are no eligible candidates to contact.");
    opening.excludedIds = excluded;
    opening.candidateIds = eligible.map((m) => m.client.id);
    opening.phase = "offering";
    record(
      opening,
      now,
      "approved",
      `Staff approved ${eligible.length} candidates and chose to begin outreach now.`,
    );
    return good("Outreach started.");
  }
  if (cmd.type === "cancel") {
    if (["canceled", "canceled_after_acceptance"].includes(opening.phase))
      return good("Opening already canceled.");
    if (opening.phase === "filled") {
      if (cmd.afterAcceptance !== true)
        return fail(
          "This opening is already filled. Use cancel confirmed hold and update Square manually.",
        );
      opening.phase = "canceled_after_acceptance";
      opening.squareUpdated = false;
    } else if (["review", "offering"].includes(opening.phase))
      opening.phase = "canceled";
    else return fail("This opening has already finished.");
    closePending(state, opening, now);
    record(
      opening,
      now,
      "canceled",
      "Staff canceled this opening. Pending links are unavailable; no further outreach. Square changes remain manual.",
    );
    return good("Opening canceled.");
  }
  if (cmd.type === "squareUpdated") {
    if (!["filled", "canceled_after_acceptance"].includes(opening.phase))
      return fail("No confirmed appointment to update.");
    if (!opening.squareUpdated) {
      opening.squareUpdated = true;
      record(
        opening,
        now,
        "calendar",
        "Staff marked the Square calendar changes as done (manual confirmation).",
      );
    }
    return good("Manual calendar work marked done.");
  }
  return fail("Unknown command.");
}
function invalidateClientOffers(
  state: SalonState,
  client: ClientEntry,
  now: number,
  reason: string,
) {
  for (const offer of state.offers.filter(
    (o) =>
      o.clientId === client.id && ["pending", "sending"].includes(o.status),
  )) {
    offer.status = "unavailable";
    offer.respondedAt = now;
    const opening = state.openings.find((o) => o.id === offer.openingId)!;
    opening.currentOfferId = undefined;
    record(
      opening,
      now,
      "skipped",
      `${client.name} ${reason}. This offer is unavailable.`,
    );
  }
}
