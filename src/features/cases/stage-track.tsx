import { cn } from "@/lib/utils";

/** Where a case is among Clio's stages for its practice area: one segment per stage, filled up to the current one. */
export function StageTrack({ stage, stages }: { stage: string; stages: string[] }) {
  const current = stages.indexOf(stage);
  return (
    <div className="flex items-center gap-2.5">
      {stages.length > 0 && (
        <div
          role="img"
          aria-label={`Stage ${current + 1} of ${stages.length}: ${stage}`}
          className="flex gap-0.5"
        >
          {stages.map((name, index) => (
            <span
              key={name}
              title={name}
              className={cn("h-1.5 w-4 rounded-full", index <= current ? "bg-primary" : "bg-border")}
            />
          ))}
        </div>
      )}
      <span>{stage}</span>
    </div>
  );
}
