import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  Client,
  Connection,
  WorkflowExecutionAlreadyStartedError,
} from "@temporalio/client";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { matches } from "./domain";
import {
  SERVICES,
  STYLISTS,
  SALON_TIMEZONE,
  type Command,
  type Result,
  type SalonState,
} from "./types";
const app = express();
const workflowId = process.env.SALON_WORKFLOW_ID ?? "juniper-salon-v1";
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(process.cwd(), "public")));
let clientPromise: Promise<Client> | undefined;
let initialized = false;
async function getHandle() {
  clientPromise ??= Connection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  })
    .then((connection) => new Client({ connection, namespace: "default" }))
    .catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  const client = await clientPromise;
  if (!initialized) {
    try {
      await client.workflow.start("salonWorkflow", {
        workflowId,
        taskQueue: "assessment-starter",
      });
    } catch (error) {
      if (!(error instanceof WorkflowExecutionAlreadyStartedError)) throw error;
    }
    initialized = true;
  }
  return client.workflow.getHandle(workflowId);
}
async function state() {
  return (await getHandle()).query<SalonState>("getSalon");
}
app.get("/api/salon", async (_req, res) => {
  const salon = await state();
  res.json({
    ...salon,
    services: SERVICES,
    stylists: STYLISTS,
    timezone: SALON_TIMEZONE,
    workflowId,
    serverNow: Date.now(),
    matches: Object.fromEntries(
      salon.openings
        .filter((o) => o.phase === "review")
        .map((o) => [o.id, matches(salon, o)]),
    ),
  });
});
app.post("/api/commands", async (req, res) => {
  if (
    ![
      "addClient",
      "removeClient",
      "deliverySetting",
      "createOpening",
      "approve",
      "cancel",
      "squareUpdated",
    ].includes(req.body?.type)
  ) {
    res.status(400).json({ ok: false, message: "Unknown staff action." });
    return;
  }
  const cmd: Command = { ...req.body };
  if (cmd.type === "approve" && !Array.isArray(cmd.reviewedCandidateIds)) {
    res.status(400).json({ ok: false, message: "Review the candidate list before approving outreach." });
    return;
  }
  if (["addClient", "createOpening"].includes(cmd.type))
    cmd.id ??= randomUUID();
  const requestId =
    typeof req.body.requestId === "string" ? req.body.requestId : randomUUID();
  const result = await (
    await getHandle()
  ).executeUpdate<Result, [Command]>("command", {
    args: [cmd],
    updateId: requestId,
  });
  res.status(result.ok ? 200 : 409).json(result);
});
app.get("/api/offers/:token", async (req, res) => {
  const salon = await state(),
    offer = salon.offers.find((o) => o.token === req.params.token);
  if (!offer) {
    res.status(404).json({ message: "Offer not found." });
    return;
  }
  const opening = salon.openings.find((o) => o.id === offer.openingId)!,
    client = salon.clients.find((c) => c.id === offer.clientId)!;
  res.json({
    offer,
    opening: {
      service: opening.service,
      stylist: opening.stylist,
      startsAt: opening.startsAt,
      phase: opening.phase,
      responseSeconds: opening.responseSeconds,
    },
    client: { name: client.name, minutes: client.minutes, status: client.status },
    serverNow: Date.now(),
    timezone: SALON_TIMEZONE,
  });
});
app.post("/api/offers/:token/respond", async (req, res) => {
  if (!["accept", "decline"].includes(req.body?.choice)) {
    res.status(400).json({ ok: false, message: "Choose accept or decline." });
    return;
  }
  const result = await (
    await getHandle()
  ).executeUpdate<Result, [Command]>("command", {
    args: [
      { type: "respond", token: req.params.token, choice: req.body.choice },
    ],
    updateId:
      typeof req.body.requestId === "string"
        ? req.body.requestId
        : randomUUID(),
  });
  res.status(result.ok ? 200 : 409).json(result);
});
app.get(
  ["/openings/:id", "/waitlist", "/demo", "/offers/:token"],
  (_req, res) => res.sendFile(path.join(process.cwd(), "public/index.html")),
);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const status = (error as { status?: number })?.status;
  if (status === 400 || status === 413) {
    res.status(status).json({ ok: false, message: status === 413 ? "Request is too large." : "Send a valid JSON request." });
    return;
  }
  console.error(error);
  res
    .status(503)
    .json({
      ok: false,
      message:
        "The service is temporarily unavailable. Your action has not been confirmed; check the current status before retrying.",
    });
});
const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Juniper Salon: http://localhost:${port}`),
);
server.on("error", (error) => {
  console.error("Could not start the API. Check that the port is free.", error);
  process.exit(1);
});
