import { z } from "zod";
import { getClientIp, jsonOk, readJson, route } from "@/lib/http";
import { respondToProposal } from "@/lib/pipeline";
import { enforceRateLimit } from "@/lib/rate-limit";

/** POST /api/v1/portal/:token/respond — the client accepts or declines their proposal. */

const RespondSchema = z.object({
  decision: z.enum(["accepted", "declined"]),
  name: z.string().trim().min(2, "الرجاء كتابة اسمك الكامل").max(120),
  note: z.string().trim().max(2000).nullish(),
  agree: z.boolean().optional(),
  plan: z.string().trim().max(20).nullish(),
});

export const POST = route<RouteContext<"/api/v1/portal/[token]/respond">>(async (request, context) => {
  const { token } = await context.params;
  await enforceRateLimit(`respond:${getClientIp(request) ?? "unknown"}`, 10, 10 * 60 * 1000);
  const body = await readJson(request, RespondSchema, { maxBytes: 16 * 1024 });
  if (body.decision === "accepted" && body.agree !== true) {
    return jsonOk({ error: { code: "terms_required", message: "الرجاء تأكيد موافقتك على شروط العرض" } }, { status: 422 });
  }
  const proposal = await respondToProposal({ token, decision: body.decision, name: body.name, note: body.note ?? null, plan: body.plan ?? null });
  return jsonOk({ status: proposal.status, respondedAt: proposal.respondedAt });
});
