import { CircleCheckIcon, CircleIcon } from "lucide-react";
import type { Reply } from "./schema";

/** What the firm needs from this office, as a checklist: a request the office has answered is ticked. */
export function NeedsChecklist({ needs, replies }: { needs: { id: string; text: string }[]; replies: Reply[] }) {
  if (needs.length === 0) return <p className="text-sm text-muted-foreground">The firm needs nothing from your office right now.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {needs.map((need) => {
        const answered = replies.some((reply) => reply.lineId === need.id);
        const Icon = answered ? CircleCheckIcon : CircleIcon;
        return (
          <li key={need.id} className="flex items-start gap-3 px-4 py-3">
            <Icon className={answered ? "mt-0.5 size-5 shrink-0 text-primary" : "mt-0.5 size-5 shrink-0 text-muted-foreground"} />
            <span className="flex flex-col gap-0.5">
              <span className="leading-relaxed">{need.text}</span>
              <span className="text-xs text-muted-foreground">{answered ? "You have replied to this" : "Open"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
