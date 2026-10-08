import assert from "node:assert/strict";
import { test } from "node:test";
const base = process.env.APP_URL ?? "http://127.0.0.1:3000";
test("HTTP boundary rejects malformed and unreviewed commands", async () => {
  const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: AbortSignal.timeout(10000) });
  let response = await post("/api/commands", "{");
  assert.equal(response.status, 400);
  response = await post("/api/offers/missing/respond", JSON.stringify({ choice: "maybe" }));
  assert.equal(response.status, 400);
  response = await post("/api/commands", JSON.stringify({ type: "approve", openingId: "missing", contactNow: true }));
  assert.equal(response.status, 400);
  response = await post("/api/commands", JSON.stringify({ type: "createOpening", service: "Haircut", stylist: "Maya", startsAt: 1e100, minutes: 60, responseSeconds: 900 }));
  assert.equal(response.status, 409);
  response = await fetch(base + "/api/salon", { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  assert.ok(Array.isArray((await response.json()).openings));
});
