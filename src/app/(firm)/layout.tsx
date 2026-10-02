import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCaseFile } from "@/features/cases/server";
import { FILTERS, matches, type MatterRow } from "@/features/matters/schema";
import { storedMatterRows } from "@/features/matters/server";

// The firm's side of the app: everything a provider must never reach lives under this layout.
// The sidebar and search read only what is stored; they never call Clio or a model.
export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  let rows: MatterRow[] = [];
  try {
    rows = await storedMatterRows();
  } catch (err) {
    console.error("[layout] matters for the sidebar:", err);
  }
  const latest = rows[0] ? await getCaseFile(rows[0].matterId).catch(() => null) : null;
  const user = latest ? { name: latest.firm.user, email: latest.firm.email, firm: latest.firm.name } : null;

  return (
    <SidebarProvider>
      <AppSidebar
        filters={FILTERS.map((filter) => ({ ...filter, count: rows.filter((row) => matches(row, filter.id)).length }))}
        recent={rows.slice(0, 5).map(({ matterId, client, stage }) => ({ matterId, client, stage }))}
      />
      <SidebarInset>
        <SiteHeader matters={rows.map(({ matterId, client, number }) => ({ matterId, client, number }))} user={user} />
        <main className="flex w-full flex-1 flex-col p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
