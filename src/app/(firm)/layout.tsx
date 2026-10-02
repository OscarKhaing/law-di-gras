import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/** The firm's side of the app: everything a provider must never reach lives under this layout. */
export default function FirmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="w-full flex-1 p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
