import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { jsonOk, readJson, route } from "@/lib/http";
import { ingestN8nEvent, N8N_EVENT_TYPES } from "@/lib/pipeline";

/**
 * POST /api/v1/events — n8n reports pipeline activity back to the app:
 *   proposal.sent      → proposal & lead move to "sent"
 *   analysis.failed    → lead flagged with the error, back to "new"
 *   crm.synced         → stores airtableRecordId / notionPageId / supabaseRecordId
 *   notification.sent, email.sent, pdf.generated, custom → activity log
 */

const EventSchema = z
  .object({
    type: z.enum(N8N_EVENT_TYPES),
    leadId: z.uuid().optional(),
    leadReference: z.string().trim().max(40).optional(),
    proposalId: z.uuid().optional(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((body) => body.leadId || body.leadReference || body.proposalId, {
    message: "leadId, leadReference or proposalId is required",
  });

export const POST = route(async (request) => {
  await authorize(request, ["n8n"]);
  const body = await readJson(request, EventSchema, { maxBytes: 64 * 1024 });
  const result = await ingestN8nEvent(body);
  return jsonOk({ ok: true, ...result }, { status: 202 });
});
