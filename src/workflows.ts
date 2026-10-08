import {
  condition,
  defineQuery,
  defineUpdate,
  proxyActivities,
  setHandler,
  uuid4,
} from "@temporalio/workflow";
import type * as activities from "./activities";
import {
  applyCommand,
  closePending,
  matches,
  record,
  seedState,
} from "./domain";
import type { Command, Result, SalonState } from "./types";
export const command = defineUpdate<Result, [Command]>("command");
export const getSalon = defineQuery<SalonState>("getSalon");
const { deliverMessage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 seconds",
  retry: { maximumAttempts: 3, initialInterval: "1 second" },
});

export async function salonWorkflow(initial?: SalonState): Promise<void> {
  const state = initial ?? seedState(Date.now());
  let revision = 0;
  const inFlight = new Set<string>();
  setHandler(getSalon, () => state);
  setHandler(command, (cmd) => {
    const result = applyCommand(state, cmd, Date.now());
    revision++;
    return result;
  });
  async function sendOffer(offerId: string) {
    const offer = state.offers.find((o) => o.id === offerId)!,
      opening = state.openings.find((o) => o.id === offer.openingId)!,
      client = state.clients.find((c) => c.id === offer.clientId)!;
    const message = state.messages.find((m) => m.id === offer.id)!;
    try {
      await deliverMessage({ id: offer.id, fail: client.failDelivery });
      message.status = "delivered";
      if (
        offer.status !== "sending" ||
        opening.phase !== "offering" ||
        client.status !== "active" ||
        Date.now() >= opening.startsAt
      )
        return;
      offer.status = "pending";
      offer.expiresAt = Math.min(
        Date.now() + opening.responseSeconds * 1000,
        opening.startsAt,
      );
      record(
        opening,
        Date.now(),
        "offered",
        `Offer delivered to ${client.name}. Waiting for a response.`,
      );
    } catch {
      message.status = "failed";
      if (offer.status === "sending" && opening.phase === "offering") {
        offer.status = "delivery_failed";
        opening.currentOfferId = undefined;
        record(
          opening,
          Date.now(),
          "delivery_failed",
          `Delivery to ${client.name} failed. Moving to the next eligible client.`,
        );
      }
    } finally {
      inFlight.delete(offerId);
      revision++;
    }
  }
  async function sendConfirmation(id: string) {
    const message = state.messages.find((m) => m.id === id)!;
    try {
      await deliverMessage({ id, fail: false });
      message.status = "delivered";
    } catch {
      message.status = "failed";
      record(
        state.openings.find((o) => o.id === message.openingId)!,
        Date.now(),
        "notification_failed",
        "Confirmation delivery failed. The accepted appointment remains held.",
      );
    } finally {
      inFlight.delete(id);
      revision++;
    }
  }
  while (true) {
    const now = Date.now();
    for (const opening of state.openings) {
      if (!["review", "offering"].includes(opening.phase)) continue;
      if (now >= opening.startsAt) {
        opening.phase = "appointment_passed";
        closePending(state, opening, now);
        record(
          opening,
          now,
          "closed",
          "Appointment start reached. Outreach stopped.",
        );
        continue;
      }
      if (opening.phase !== "offering") continue;
      let current = state.offers.find((o) => o.id === opening.currentOfferId);
      if (current?.status === "pending" && now >= current.expiresAt!) {
        current.status = "expired";
        current.respondedAt = now;
        opening.currentOfferId = undefined;
        record(
          opening,
          now,
          "expired",
          `${state.clients.find((c) => c.id === current!.clientId)!.name}'s offer timed out. Moving to the next eligible client.`,
        );
        current = undefined;
      }
      if (current && ["sending", "pending"].includes(current.status)) continue;
      const tried = new Set(
        state.offers
          .filter((o) => o.openingId === opening.id)
          .map((o) => o.clientId),
      );
      const eligible = new Set(
        matches(state, opening)
          .filter((m) => m.eligible)
          .map((m) => m.client.id),
      );
      const client = opening.candidateIds
        .map((id) => state.clients.find((c) => c.id === id)!)
        .find((c) => c && !tried.has(c.id) && eligible.has(c.id));
      if (!client) {
        opening.phase = "exhausted";
        opening.currentOfferId = undefined;
        record(
          opening,
          now,
          "exhausted",
          "All approved eligible clients have been tried. No acceptance.",
        );
        continue;
      }
      const id = uuid4();
      state.offers.push({
        id,
        token: uuid4(),
        openingId: opening.id,
        clientId: client.id,
        status: "sending",
        createdAt: now,
      });
      opening.currentOfferId = id;
      state.messages.push({
        id,
        openingId: opening.id,
        clientId: client.id,
        offerId: id,
        kind: "offer",
        text: `${opening.service} with ${opening.stylist} — an earlier appointment is available for ${client.name}.`,
        at: now,
        status: "queued",
      });
      record(opening, now, "sending", `Sending an offer to ${client.name}.`);
      inFlight.add(id);
      void sendOffer(id);
    }
    for (const msg of state.messages.filter(
      (m) =>
        m.kind === "confirmation" &&
        m.status === "queued" &&
        !inFlight.has(m.id),
    )) {
      inFlight.add(msg.id);
      void sendConfirmation(msg.id);
    }
    const deadlines = [
      ...state.openings
        .filter((o) => ["review", "offering"].includes(o.phase))
        .map((o) => o.startsAt),
      ...state.offers
        .filter((o) => o.status === "pending")
        .map((o) => o.expiresAt!),
    ];
    const observed = revision;
    if (deadlines.length)
      await condition(
        () => revision !== observed,
        Math.max(1, Math.min(...deadlines) - Date.now()),
      );
    else await condition(() => revision !== observed);
  }
}
