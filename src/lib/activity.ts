import type { LeadEvent } from "@/lib/types";

/** Human-readable one-liners for the activity feed and live toasts. */
export function describeEvent(event: Pick<LeadEvent, "type" | "data" | "actor">): string {
  const d = event.data as Record<string, unknown>;
  const str = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : "");
  switch (event.type) {
    case "lead.created":
      return `New brief received${str("reference") ? ` · ${str("reference")}` : ""}`;
    case "lead.status_changed":
      return `Status ${str("from") || "—"} → ${str("to")}`;
    case "lead.note_added":
      return "Internal notes updated";
    case "analysis.requested":
      return `Analysis requested (${str("runner") === "n8n" ? "n8n workflow" : "in-app"}${str("trigger") === "regenerate" ? ", regenerate" : ""})`;
    case "analysis.completed":
      return `Scope analysis ready · ${str("provider")}${str("model") ? ` ${str("model")}` : ""}${str("fallbackReason") ? " (fallback)" : ""}`;
    case "analysis.failed":
      return `Analysis failed: ${str("error").slice(0, 120)}`;
    case "proposal.created":
      return `Proposal draft v${d.version ?? "?"} created`;
    case "proposal.updated":
      return d.reopened ? "Proposal edited — back to draft" : "Proposal edited";
    case "proposal.approved":
      return "Proposal approved";
    case "proposal.sent":
      return `Proposal sent${str("channel") ? ` via ${str("channel")}` : ""}`;
    case "proposal.viewed":
      return d.firstView ? "Client opened the proposal" : "Client viewed the proposal again";
    case "proposal.accepted":
      return `Proposal accepted${str("name") ? ` by ${str("name")}` : ""}${str("plan") ? ` · ${str("plan")} plan` : ""} 🎉`;
    case "proposal.declined":
      return `Proposal declined${str("name") ? ` by ${str("name")}` : ""}`;
    case "pdf.generated":
      return "Proposal PDF generated";
    case "notification.sent":
      return d.delivered === false
        ? `Notification failed${str("channel") ? ` · ${str("channel")}` : ""}${str("error") ? `: ${str("error").slice(0, 80)}` : ""}`
        : `Notification sent${str("channel") ? ` · ${str("channel")}` : ""}`;
    case "email.sent":
      return `Email sent${str("kind") ? ` · ${str("kind").replace(/_/g, " ")}` : ""}${str("to") ? ` → ${str("to")}` : ""}`;
    case "email.failed":
      return `Email failed${str("kind") ? ` · ${str("kind").replace(/_/g, " ")}` : ""}: ${str("error").slice(0, 100)}`;
    case "crm.synced":
      return `CRM synced${str("provider") ? ` · ${str("provider")}` : ""}`;
    case "webhook.failed":
      return `n8n delivery failed (${str("target")}): ${str("error").slice(0, 100)}`;
    default:
      return str("message") || event.type;
  }
}

export function eventTone(type: LeadEvent["type"]): "good" | "warn" | "bad" | "info" | "neutral" {
  if (type === "proposal.accepted" || type === "analysis.completed") return "good";
  if (type === "analysis.failed" || type === "webhook.failed" || type === "email.failed" || type === "proposal.declined") return "bad";
  if (type === "lead.created" || type === "proposal.created") return "warn";
  if (type.startsWith("proposal.")) return "info";
  return "neutral";
}
