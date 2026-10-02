import { cn } from "@/lib/utils";

/**
 * Where a case is among Clio's stages for its practice area: one segment per stage, finished ones
 * green and the current one in ink. `named` writes every stage under its segment, for the top of a
 * case; `stacked` stretches the segments across a narrow column with the current stage below.
 */
export function StageTrack({
  stage,
  stages,
  named = false,
  stacked = false,
}: {
  stage: string;
  stages: string[];
  named?: boolean;
  stacked?: boolean;
}) {
  const current = stages.indexOf(stage);
  const label = current >= 0 ? `Stage ${current + 1} of ${stages.length}: ${stage}` : `Stage: ${stage}`;
  const fill = (index: number) => (index < current ? "bg-done" : index === current ? "bg-primary" : "bg-border");

  if (stacked) {
    return (
      <div className="space-y-1.5">
        {stages.length > 0 && (
          <div role="img" aria-label={label} className="flex gap-0.5">
            {stages.map((name, index) => (
              <span key={name} title={name} className={cn("h-1.5 flex-1 rounded-full", fill(index))} />
            ))}
          </div>
        )}
        <p>{stage || "No stage in Clio"}</p>
      </div>
    );
  }

  if (named && stages.length > 0) {
    return (
      <ol aria-label={label} className="grid gap-x-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
        {stages.map((name, index) => (
          <li key={name} aria-current={index === current ? "step" : undefined} className="min-w-0">
            <span className={cn("block h-1.5 rounded-full", fill(index))} />
            <span
              title={name}
              className={cn(
                "mt-1.5 block truncate text-xs",
                index === current ? "font-medium text-foreground" : "text-muted-foreground",
                // On a narrow screen only the current stage is written out.
                index !== current && "max-sm:hidden",
              )}
            >
              {name}
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      {stages.length > 0 && (
        <div role="img" aria-label={label} className="flex gap-0.5">
          {stages.map((name, index) => (
            <span
              key={name}
              title={name}
              className={cn("h-1.5 w-4 rounded-full", fill(index))}
            />
          ))}
        </div>
      )}
      <span>{stage || "No stage in Clio"}</span>
    </div>
  );
}
