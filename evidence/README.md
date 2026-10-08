# Evidence

Captured from the real local prototype on October 8, 2026, using fictional clients.

- `temporal-workflow.jpg`: Temporal Web UI for `juniper-salon-v1`, showing its running status and meaningful execution history. The salon coordinator remains running to manage future openings; individual opening outcomes appear in the application.
- `client-offer.jpg`: client offer page at a 390-pixel mobile viewport before acceptance.
- `prototype.jpg`: staff view after Nina declined and Eli accepted, with recorded history and manual Square reminder.
- `dashboard.jpg`: appointment board with the completed sample opening.

The initial salon execution includes a recovered Workflow Task failure caused by an older starter Worker polling the same queue before it was stopped. The correct Worker resumed the execution successfully. No production messages or real client records are involved.

Automated local Temporal tests separately verify delivery failure, actual timer expiry, competing claims across openings, cancellation, and Worker restart recovery. Test executions are terminated after their assertions because the salon coordinator is intentionally long-lived.

