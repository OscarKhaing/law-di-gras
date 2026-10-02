import Link from "next/link";

/** Shown when a case or a provider in the address is not one Case Desk knows. */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">That page is not here</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        The case or the provider in the address is not one Case Desk knows. It may have been removed in Clio, or the
        address may be mistyped.
      </p>
      <Link href="/" className="text-sm font-medium text-primary underline underline-offset-4">
        Back to the cases
      </Link>
    </div>
  );
}
