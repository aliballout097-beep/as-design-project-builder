import { z } from "zod";
import { authorize } from "@/lib/auth/guard";
import { getRepository } from "@/lib/db";
import { ApiError, jsonOk, readJson, route } from "@/lib/http";
import { sendToN8n } from "@/lib/n8n";
import { pipelinePayload } from "@/lib/pipeline/payloads";

/**
 * POST /api/v1/admin/test-webhook — send a test event to one n8n workflow and report the result.
 *
 * Plain test: fires `test.ping` so the target workflow can be checked for reachability.
 * Lead intake with an `email`: fires a real `lead.created` event built from the most recent
 * lead (contact swapped to the given address) so the admin can see the actual notification /
 * acknowledgement emails the workflow sends, without submitting a fake project through the builder.
 */

const TestSchema = z.object({
  target: z.enum(["leadIntake", "analysis", "dispatch", "crmSync"]),
  email: z.email().optional(),
});

export const POST = route(async (request) => {
  const principal = await authorize(request, ["admin"]);
  const { target, email } = await readJson(request, TestSchema);
  const requestedBy = principal.kind === "admin" ? principal.email : "n8n";

  if (target === "leadIntake" && email) {
    const { items } = await getRepository().listLeads({ limit: 1 });
    const sample = items[0];
    if (!sample) throw new ApiError(400, "no_sample_lead", "No lead exists yet to build a test email from — seed the demo data first.");
    const testLead = {
      ...sample,
      contact: { ...sample.contact, email, name: `${sample.contact.name} (test send)` },
    };
    const result = await sendToN8n("leadIntake", "lead.created", pipelinePayload(testLead, null, { test: true, requestedBy }));
    return jsonOk({ target, ...result });
  }

  const result = await sendToN8n(target, "test.ping", {
    test: true,
    message: "Connection test from the AS Design Studio dashboard",
    requestedBy,
  });
  return jsonOk({ target, ...result });
});
