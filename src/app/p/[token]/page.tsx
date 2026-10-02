import type { Metadata } from "next";
import { ProviderUpdateView } from "@/features/shares/provider-update-view";
import { getShareByToken } from "@/features/shares/server";

// The provider's page: what one treating provider's office sees through its link. It has no
// sidebar, and it reads nothing but the update published to this token: getShareByToken is the
// permission boundary, and this page imports nothing else that can reach the case.

export const dynamic = "force-dynamic";

// The title says nothing about the case, and the page is kept out of search engines.
export const metadata: Metadata = { title: "Case update", robots: { index: false, follow: false } };

export default async function ProviderPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;

  let share: Awaited<ReturnType<typeof getShareByToken>> = null;
  let failed = false;
  try {
    share = await getShareByToken(token);
  } catch (err) {
    console.error("[p] could not open an update:", err);
    failed = true;
  }

  if (failed) {
    return (
      <Plain heading="This update could not be opened just now">
        <span className="text-destructive">Something went wrong on our side.</span> Reload the page in a minute. If it keeps
        happening, call the law firm that sent you the link.
      </Plain>
    );
  }

  // Unknown, withdrawn and expired links all get the same page, which says nothing about any case.
  if (!share) {
    return (
      <Plain heading="This link has expired">
        Case updates are shared for a limited time and can be withdrawn by the firm. Call or email the law firm that sent
        you the link and ask for a new one.
      </Plain>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8 sm:py-14">
      <ProviderUpdateView update={share.update} replies={share.replies} token={token} />
    </main>
  );
}

function Plain({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-2 px-4 py-12 sm:px-8 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="leading-relaxed text-muted-foreground">{children}</p>
    </main>
  );
}
