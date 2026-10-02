import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { ProviderUpdateView } from "@/features/shares/provider-update-view";
import { getShareByToken, recordOpen } from "@/features/shares/link";

// The provider's page: what one treating provider's office sees through its link. It has no
// sidebar, and it reads nothing but the update published to this token. getShareByToken is the
// permission boundary: it lives in link.ts, which cannot read the case file, the brief or the
// draft, and this page imports nothing from the firm's side (server.ts).

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
    return <Plain heading="This link is no longer active">Ask the law firm that sent it to you for a new one.</Plain>;
  }

  // The open is logged once the page has been sent, so the office never waits on it.
  const { id } = share;
  const userAgent = (await headers()).get("user-agent");
  after(() => recordOpen(id, userAgent));

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8 sm:py-14">
      <ProviderUpdateView update={share.update} replies={share.replies} files={share.files} token={token} />
    </main>
  );
}

function Plain({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-20">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-2 leading-relaxed text-muted-foreground">{children}</p>
    </main>
  );
}
