import { leadIntakeWorkflow } from "./workflows/01-lead-intake";
import { aiScopeAnalysisWorkflow } from "./workflows/02-ai-scope-analysis";
import { proposalPdfWorkflow } from "./workflows/03-proposal-pdf";
import { clientDispatchWorkflow } from "./workflows/04-client-dispatch";
import { crmSyncWorkflow } from "./workflows/05-crm-sync";

/** Every exported workflow, keyed by output file name. */
export const WORKFLOWS = {
  "01-lead-intake.json": leadIntakeWorkflow,
  "02-ai-scope-analysis.json": aiScopeAnalysisWorkflow,
  "03-proposal-pdf.json": proposalPdfWorkflow,
  "04-client-dispatch-alerts.json": clientDispatchWorkflow,
  "05-crm-sync.json": crmSyncWorkflow,
} as const;
