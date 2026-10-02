import { Suspense } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import type { ListedCase } from "@/features/brief/schema";
import { listedCases } from "@/features/brief/server";

export const dynamic = "force-dynamic";

/** The firm's side of the app: everything a provider must never reach lives under this layout. */
export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  // The sidebar's worklists come from what is stored; if that cannot be read, the page still opens.
  let cases: ListedCase[] = [];
  try {
    cases = await listedCases();
  } catch (err) {
    console.error("[sidebar] the worklists could not be loaded:", err);
  }
  return (
    <SidebarProvider>
      <Suspense>
        <AppSidebar cases={cases} />
      </Suspense>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="w-full flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
