// The provider's page: what one treating provider's office sees through its link. It has no
// sidebar and must read nothing but the update published to this token. Lane 3 builds it.
export default async function ProviderPage({ params }: PageProps<"/p/[token]">) {
  await params;
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">This link is not active</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask the law firm that sent it to you for a new one.
      </p>
    </main>
  );
}
