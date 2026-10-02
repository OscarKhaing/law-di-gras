import type { Metadata } from "next";
import { headers } from "next/headers";
import { after } from "next/server";
import { ProviderView } from "@/features/shares/provider-view";
import { recordOpen, shareForToken } from "@/features/shares/server";

export const dynamic = "force-dynamic";

// The page holds a patient's details: keep it out of search engines even if a link is posted publicly.
export const metadata: Metadata = { title: "Case update", robots: { index: false, follow: false } };

// The provider's page: what one treating provider's office sees through its link. It has no
// sidebar and reads nothing but the update published to this token.
export default async function ProviderPage({ params }: PageProps<"/p/[token]">) {
  const { token } = await params;
  const share = await shareForToken(token);
  if (!share) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">This link is not active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have expired or been withdrawn. Ask the law firm that sent it to you for a new one.
        </p>
      </main>
    );
  }

  const userAgent = (await headers()).get("user-agent");
  after(() => recordOpen(share.id, userAgent));
  return <ProviderView update={share.update} />;
}
