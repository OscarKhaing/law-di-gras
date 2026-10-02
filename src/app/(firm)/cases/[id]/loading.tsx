import { Skeleton } from "@/components/ui/skeleton";

/** The brief's shape while it loads: header, the sections on the left and the facts on the right. */
export default function Loading() {
  return (
    <div role="status" aria-label="Opening the brief" className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex flex-1 flex-col gap-10 lg:max-w-[760px]">
          {[3, 2, 6, 5, 4].map((lines, index) => (
            <div key={index} className="flex flex-col gap-2.5">
              <Skeleton className="h-3 w-28" />
              {Array.from({ length: lines }, (_, line) => (
                <Skeleton key={line} className="h-5" style={{ width: `${92 - ((line * 13) % 30)}%` }} />
              ))}
            </div>
          ))}
        </div>
        <Skeleton className="h-[32rem] w-full lg:w-80" />
      </div>
    </div>
  );
}
