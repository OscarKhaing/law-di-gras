import { Badge } from "@/components/ui/badge";
import type { CaseStatus } from "@/lib/mock-data";

const STATUS: Record<CaseStatus, { label: string; variant: "secondary" | "outline" | "destructive" }> = {
  on_track: { label: "On track", variant: "secondary" },
  needs_review: { label: "Needs review", variant: "outline" },
  blocked: { label: "Blocked", variant: "destructive" },
};

export function StatusBadge({ status }: { status: CaseStatus }) {
  const { label, variant } = STATUS[status];
  return <Badge variant={variant}>{label}</Badge>;
}
