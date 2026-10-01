import { cn } from "@/lib/utils";
import { STAGES, type Stage } from "./data";

/** Where a case is on its way from intake to settlement: one segment per stage, filled up to the current one. */
export function StageTrack({ stage }: { stage: Stage }) {
  const current = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-2.5">
      <div
        role="img"
        aria-label={`Stage ${current + 1} of ${STAGES.length}: ${stage}`}
        className="flex gap-0.5"
      >
        {STAGES.map((name, index) => (
          <span
            key={name}
            className={cn("h-1.5 w-4 rounded-full", index <= current ? "bg-primary" : "bg-border")}
          />
        ))}
      </div>
      <span>{stage}</span>
    </div>
  );
}
