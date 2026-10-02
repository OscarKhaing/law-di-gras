import { Skeleton } from "@/components/ui/skeleton";

/** While a case is being loaded from what is stored: the shape of the page, so nothing jumps. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6" role="status" aria-label="Opening the case">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-52 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
