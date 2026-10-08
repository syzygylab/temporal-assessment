import { ApplicationFailure } from "@temporalio/activity";
// No external side effects: the Workflow stores one simulated receipt per ID.
// A live provider must honor this idempotency key to avoid duplicate texts.
export async function deliverMessage(input: {
  id: string;
  fail: boolean;
}): Promise<{ receipt: string }> {
  if (input.fail)
    throw ApplicationFailure.nonRetryable(
      "Simulated undeliverable mobile number",
      "DeliveryRejected",
    );
  return { receipt: `simulated:${input.id}` };
}
