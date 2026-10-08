import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "../src/activities";
import type { Command, Result, SalonState } from "../src/types";
test(
  "real Temporal: failed delivery, timeout, decline, competing claims and cancel",
  { timeout: 90000 },
  async () => {
    const connection = await Connection.connect({ address: "localhost:7233" }),
      native = await NativeConnection.connect({ address: "localhost:7233" });
    const client = new Client({ connection }),
      id = `juniper-test-${randomUUID()}`;
    const worker = await Worker.create({
      connection: native,
      taskQueue: id,
      workflowsPath: require.resolve("../src/workflows"),
      activities,
    });
    const handle = await client.workflow.start("salonWorkflow", {
      workflowId: id,
      taskQueue: id,
    });
    const update = (cmd: Command) =>
      handle.executeUpdate<Result, [Command]>("command", { args: [cmd] });
    const read = () => handle.query<SalonState>("getSalon");
    async function until(check: (s: SalonState) => boolean, timeout = 10000) {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const s = await read();
        if (check(s)) return s;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("Expected state did not arrive");
    }
    try {
      await worker.runUntil(async () => {
        const create = (openingId: string, responseSeconds = 900) =>
          update({
            type: "createOpening",
            id: openingId,
            service: "Haircut",
            stylist: "Maya",
            startsAt: Date.now() + 3600000,
            minutes: 60,
            responseSeconds,
          });
        await create("a", 20);
        await update({
          type: "deliverySetting",
          clientId: "client-1",
          fail: true,
        });
        await update({ type: "approve", openingId: "a", contactNow: true });
        let s = await until((s) =>
          s.offers.some(
            (o) => o.clientId === "client-2" && o.status === "pending",
          ),
        );
        assert.equal(s.offers[0].status, "delivery_failed");
        const stale = s.offers.find((o) => o.status === "pending")!;
        s = await until(
          (s) =>
            s.offers.some(
              (o) => o.clientId === "client-3" && o.status === "pending",
            ),
          30000,
        );
        assert.equal(
          (
            await update({
              type: "respond",
              token: stale.token,
              choice: "accept",
            })
          ).ok,
          false,
        );
        const current = s.offers.find((o) => o.clientId === "client-3")!;
        assert.equal(
          (
            await update({
              type: "respond",
              token: current.token,
              choice: "decline",
            })
          ).ok,
          true,
        );
        await until((s) => s.openings[0].phase === "exhausted");
        await update({
          type: "deliverySetting",
          clientId: "client-1",
          fail: false,
        });
        await create("b");
        await create("c");
        await update({ type: "approve", openingId: "b", contactNow: true });
        await update({ type: "approve", openingId: "c", contactNow: true });
        s = await until(
          (s) =>
            s.offers.filter(
              (o) => o.clientId === "client-1" && o.status === "pending",
            ).length === 2,
        );
        const results = await Promise.all(
          s.offers
            .filter((o) => o.clientId === "client-1" && o.status === "pending")
            .map((o) =>
              update({ type: "respond", token: o.token, choice: "accept" }),
            ),
        );
        assert.equal(results.filter((r) => r.ok).length, 1);
        s = await read();
        assert.equal(s.openings.filter((o) => o.phase === "filled").length, 1);
        const remaining = s.openings.find((o) => o.phase === "offering")!;
        await update({ type: "cancel", openingId: remaining.id });
        s = await read();
        assert.equal(
          s.openings.find((o) => o.id === remaining.id)!.phase,
          "canceled",
        );
      });
    } finally {
      await handle.terminate("Automated test finished");
      await native.close();
      await connection.close();
    }
  },
);
