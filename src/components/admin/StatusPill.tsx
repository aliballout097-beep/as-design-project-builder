import type { LeadStatus, ProposalStatus } from "@/lib/types";
import { cn } from "@/components/ui/cn";

const LEAD: Record<LeadStatus, { label: string; tone: string; dot: string; pulse?: boolean }> = {
  new: { label: "New", tone: "border-glacier-400/25 bg-glacier-400/10 text-glacier-200", dot: "bg-glacier-400" },
  analyzing: { label: "Analyzing", tone: "border-iris-400/25 bg-iris-400/10 text-iris-300", dot: "bg-iris-400", pulse: true },
  review: { label: "Needs review", tone: "border-ember-400/30 bg-ember-500/12 text-ember-200", dot: "bg-ember-400" },
  approved: { label: "Approved", tone: "border-info/25 bg-info/10 text-info", dot: "bg-info" },
  sent: { label: "Sent", tone: "border-line/15 bg-line/[0.06] text-ivory", dot: "bg-ivory" },
  won: { label: "Won", tone: "border-success/25 bg-success/10 text-success", dot: "bg-success" },
  lost: { label: "Lost", tone: "border-line/10 bg-line/[0.03] text-fog", dot: "bg-fog" },
  archived: { label: "Archived", tone: "border-line/10 bg-transparent text-fog", dot: "bg-fog/60" },
};

const PROPOSAL: Record<ProposalStatus, { label: string; tone: string; dot: string }> = {
  draft: { label: "Draft", tone: "border-ember-400/30 bg-ember-500/12 text-ember-200", dot: "bg-ember-400" },
  approved: { label: "Approved", tone: "border-info/25 bg-info/10 text-info", dot: "bg-info" },
  sent: { label: "Sent", tone: "border-line/15 bg-line/[0.06] text-ivory", dot: "bg-ivory" },
  accepted: { label: "Accepted", tone: "border-success/25 bg-success/10 text-success", dot: "bg-success" },
  declined: { label: "Declined", tone: "border-danger/25 bg-danger/10 text-danger", dot: "bg-danger" },
  superseded: { label: "Superseded", tone: "border-line/10 bg-transparent text-fog", dot: "bg-fog/60" },
};

export const LEAD_STATUS_LABELS = Object.fromEntries(Object.entries(LEAD).map(([k, v]) => [k, v.label])) as Record<LeadStatus, string>;

function Pill({ label, tone, dot, pulse, className }: { label: string; tone: string; dot: string; pulse?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium", tone, className)}>
      <span className={cn("size-1.5 rounded-full", dot, pulse && "animate-pulse-soft")} aria-hidden />
      {label}
    </span>
  );
}

export function LeadStatusPill({ status, className }: { status: LeadStatus; className?: string }) {
  return <Pill {...LEAD[status]} className={className} />;
}

export function ProposalStatusPill({ status, className }: { status: ProposalStatus; className?: string }) {
  return <Pill {...PROPOSAL[status]} className={className} />;
}
