import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "../src/activities";
import type { Command, Result, SalonState } from "../src/types";

test(
  "pending offer and original deadline survive a Worker restart",
  { timeout: 60000 },
  async () => {
    const connection = await Connection.connect({ address: "localhost:7233" });
    const native = await NativeConnection.connect({
      address: "localhost:7233",
    });
    const client = new Client({ connection }),
      id = `juniper-recovery-${randomUUID()}`;
    const options = {
      connection: native,
      taskQueue: id,
      workflowsPath: require.resolve("../src/workflows"),
      activities,
    };
    const worker = await Worker.create(options);
    const handle = await client.workflow.start("salonWorkflow", {
      workflowId: id,
      taskQueue: id,
    });
    const update = (cmd: Command) =>
      handle.executeUpdate<Result, [Command]>("command", { args: [cmd] });
    const read = () => handle.query<SalonState>("getSalon");
    let original!: SalonState;
    try {
      await worker.runUntil(async () => {
        await update({
          type: "createOpening",
          id: "recovery",
          service: "Haircut",
          stylist: "Maya",
          startsAt: Date.now() + 3600000,
          minutes: 60,
          responseSeconds: 20,
        });
        await update({
          type: "approve",
          openingId: "recovery",
          contactNow: true,
        });
        for (let i = 0; i < 100; i++) {
          original = await read();
          if (original.offers[0]?.status === "pending") break;
          await new Promise((r) => setTimeout(r, 50));
        }
        assert.equal(original.offers[0].status, "pending");
      });
      // No Worker is polling this queue while the durable deadline passes.
      await new Promise((r) =>
        setTimeout(
          r,
          Math.max(1, original.offers[0].expiresAt! - Date.now() + 500),
        ),
      );
      const restarted = await Worker.create(options);
      await restarted.runUntil(async () => {
        let recovered!: SalonState;
        for (let i = 0; i < 100; i++) {
          recovered = await read();
          if (recovered.offers[1]?.status === "pending") break;
          await new Promise((r) => setTimeout(r, 50));
        }
        assert.equal(recovered.offers[0].id, original.offers[0].id);
        assert.equal(
          recovered.offers[0].expiresAt,
          original.offers[0].expiresAt,
        );
        assert.equal(recovered.offers[0].status, "expired");
        assert.equal(recovered.offers[1].clientId, "client-2");
        assert.equal(recovered.offers.length, 2);
        assert.equal(
          recovered.messages.filter((m) => m.clientId === "client-1").length,
          1,
        );
      });
    } finally {
      await handle.terminate("Recovery test complete");
      await native.close();
      await connection.close();
    }
  },
);
