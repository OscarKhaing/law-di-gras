import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Where the case is among the firm's stages in Clio, as steps: done, current, still to come. */
export function StageStepper({ stage, stages }: { stage: string; stages: string[] }) {
  const current = stages.indexOf(stage);
  if (stages.length === 0 || current < 0) {
    return <p className="text-sm text-muted-foreground">{stage ? `Current stage: ${stage}` : "The firm has not said which stage the case is at."}</p>;
  }
  return (
    <div className="@container"><ol aria-label={`Stage ${current + 1} of ${stages.length}: ${stage}`} className="flex flex-col gap-2 @xl:flex-row @xl:gap-0">
      {stages.map((name, index) => {
        const done = index < current;
        const now = index === current;
        return (
          <li key={name} aria-current={now ? "step" : undefined} className="flex min-w-0 flex-1 items-center gap-2 @xl:flex-col @xl:items-start @xl:gap-1.5">
            <span className="flex items-center @xl:w-full">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-primary bg-primary text-primary-foreground",
                  now && "border-primary bg-background text-primary ring-4 ring-primary/15",
                  !done && !now && "bg-background text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : <span className="font-mono">{index + 1}</span>}
              </span>
              {index < stages.length - 1 && <span aria-hidden className={cn("hidden h-0.5 flex-1 @xl:block", done ? "bg-primary" : "bg-border")} />}
            </span>
            <span className={cn("text-sm break-words @xl:pr-1 @xl:text-xs", now ? "font-medium text-foreground" : "text-muted-foreground")}>{name}</span>
          </li>
        );
      })}
    </ol></div>
  );
}
