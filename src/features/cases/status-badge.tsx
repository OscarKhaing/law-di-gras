import { Badge } from "@/components/ui/badge";
import type { CaseStatus } from "./data";

// Green for fine, marker yellow for "a person must look", red for stuck: the same meanings as everywhere else.
const STATUS: Record<CaseStatus, { label: string; className: string }> = {
  on_track: { label: "On track", className: "bg-secondary text-primary" },
  needs_review: { label: "Needs review", className: "bg-marker text-foreground" },
  blocked: { label: "Blocked", className: "bg-destructive/10 text-destructive" },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { label, className } = STATUS[status];
  return <Badge className={className}>{label}</Badge>;
}
