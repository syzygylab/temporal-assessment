import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCommand, matches, seedState } from "../src/domain";
const now = 1800000000000;
function fixture() {
  const state = seedState(now);
  applyCommand(
    state,
    {
      type: "createOpening",
      id: "a",
      service: "Haircut",
      stylist: "Maya",
      startsAt: now + 3600000,
      minutes: 60,
      responseSeconds: 900,
    },
    now,
  );
  return state;
}
function pending(state: ReturnType<typeof fixture>, openingId: string) {
  const opening = state.openings.find((o) => o.id === openingId)!;
  opening.phase = "offering";
  opening.currentOfferId = `offer-${openingId}`;
  state.offers.push({
    id: `offer-${openingId}`,
    token: `token-${openingId}`,
    openingId,
    clientId: "client-1",
    status: "pending",
    createdAt: now,
    expiresAt: now + 20000,
  });
}
test("matching checks availability, duration, service, required stylist, and FIFO", () => {
  const s = fixture();
  assert.deepEqual(
    matches(s, s.openings[0])
      .filter((m) => m.eligible)
      .map((m) => m.client.id),
    ["client-1", "client-2", "client-3"],
  );
  s.openings[0].minutes = 30;
  assert.equal(matches(s, s.openings[0]).filter((m) => m.eligible).length, 0);
});
test("review requires consent and honors exclusions", () => {
  const s = fixture();
  assert.equal(
    applyCommand(s, { type: "approve", openingId: "a" }, now).ok,
    false,
  );
  assert.equal(
    applyCommand(
      s,
      {
        type: "approve",
        openingId: "a",
        contactNow: true,
        excludedIds: ["client-1"],
      },
      now,
    ).ok,
    true,
  );
  assert.deepEqual(s.openings[0].candidateIds, ["client-2", "client-3"]);
});
test("client cannot claim two openings; repeated winning acceptance is idempotent", () => {
  const s = fixture();
  applyCommand(
    s,
    {
      type: "createOpening",
      id: "b",
      service: "Haircut",
      stylist: "Maya",
      startsAt: now + 7200000,
      minutes: 60,
      responseSeconds: 900,
    },
    now,
  );
  pending(s, "a");
  pending(s, "b");
  assert.equal(
    applyCommand(
      s,
      { type: "respond", token: "token-a", choice: "accept" },
      now + 1,
    ).ok,
    true,
  );
  assert.equal(
    applyCommand(
      s,
      { type: "respond", token: "token-b", choice: "accept" },
      now + 2,
    ).ok,
    false,
  );
  assert.equal(
    applyCommand(
      s,
      { type: "respond", token: "token-a", choice: "accept" },
      now + 3,
    ).ok,
    true,
  );
  assert.equal(s.openings.filter((o) => o.phase === "filled").length, 1);
  assert.equal(s.messages.length, 1);
});
test("deadline enforced before timer processing", () => {
  const s = fixture();
  pending(s, "a");
  assert.equal(
    applyCommand(
      s,
      { type: "respond", token: "token-a", choice: "accept" },
      now + 20000,
    ).ok,
    false,
  );
});
test("cancel prevents acceptance; decline retains membership", () => {
  const s = fixture();
  pending(s, "a");
  assert.equal(
    applyCommand(
      s,
      { type: "respond", token: "token-a", choice: "decline" },
      now,
    ).ok,
    true,
  );
  assert.equal(s.clients[0].status, "active");
  const t = fixture();
  pending(t, "a");
  applyCommand(t, { type: "cancel", openingId: "a" }, now);
  assert.equal(
    applyCommand(
      t,
      { type: "respond", token: "token-a", choice: "accept" },
      now,
    ).ok,
    false,
  );
});
test("removal invalidates pending offers", () => {
  const s = fixture();
  pending(s, "a");
  applyCommand(s, { type: "removeClient", clientId: "client-1" }, now);
  assert.equal(s.offers[0].status, "unavailable");
});
test("approval rejects a stale reviewed candidate list", () => {
  const s = fixture();
  const reviewed = matches(s, s.openings[0]).filter(m => m.eligible).map(m => m.client.id);
  s.clients[1].status = "removed";
  assert.equal(applyCommand(s, { type: "approve", openingId: "a", contactNow: true, reviewedCandidateIds: reviewed }, now).ok, false);
  assert.equal(s.openings[0].phase, "review");
  assert.equal(applyCommand(s, { type: "approve", openingId: "a", contactNow: true, reviewedCandidateIds: ["client-1", "client-3"] }, now).ok, true);
});
test("out-of-range dates cannot poison the dashboard", () => {
  const s = fixture();
  assert.equal(applyCommand(s, { type: "createOpening", id: "invalid", service: "Haircut", stylist: "Maya", startsAt: 1e100, minutes: 60, responseSeconds: 900 }, now).ok, false);
  assert.equal(applyCommand(s, { type: "addClient", id: "invalid", name: "Demo", mobile: "202-555-0199", service: "Haircut", stylist: "any", availableFrom: now, availableUntil: 1e100 }, now).ok, false);
});
