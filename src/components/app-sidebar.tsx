"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlarmClockIcon,
  ClockIcon,
  FolderOpenIcon,
  HospitalIcon,
  ScaleIcon,
  ShieldIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

/** A saved filter of the case table, with how many matters it holds. */
export type SidebarFilter = { id: string; label: string; count: number };
/** A matter recently read into Case Desk. */
export type SidebarMatter = { matterId: number; client: string; stage: string };

const ICONS: Record<string, LucideIcon> = {
  all: FolderOpenIcon,
  overdue: AlarmClockIcon,
  provider: HospitalIcon,
  insurer: ShieldIcon,
  limits: TriangleAlertIcon,
  sol: ClockIcon,
};

/** The firm's navigation: the saved filters of the case table, then the matters read most recently. */
export function AppSidebar({ filters, recent }: { filters: SidebarFilter[]; recent: SidebarMatter[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/" />} tooltip="Case Desk">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <ScaleIcon className="size-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">Case Desk</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Matters</SidebarGroupLabel>
          {/* Only the active filter reads the URL, so only it waits on the search params. */}
          <Suspense fallback={<Filters filters={filters} current={null} />}>
            <ActiveFilters filters={filters} />
          </Suspense>
        </SidebarGroup>
        {recent.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarMenu>
              {recent.map((matter) => (
                <SidebarMenuItem key={matter.matterId}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={pathname === `/cases/${matter.matterId}`}
                    render={<Link href={`/cases/${matter.matterId}`} />}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{matter.client || "Client not named"}</span>
                      <span className="truncate text-xs text-muted-foreground">{matter.stage || "No stage in Clio"}</span>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveFilters({ filters }: { filters: SidebarFilter[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return <Filters filters={filters} current={pathname === "/" ? (searchParams.get("filter") ?? "all") : null} />;
}

function Filters({ filters, current }: { filters: SidebarFilter[]; current: string | null }) {
  return (
    <SidebarMenu>
      {filters.map((filter) => {
        const Icon = ICONS[filter.id] ?? FolderOpenIcon;
        return (
          <SidebarMenuItem key={filter.id}>
            <SidebarMenuButton
              isActive={current === filter.id}
              tooltip={`${filter.label}: ${filter.count}`}
              render={<Link href={filter.id === "all" ? "/" : `/?filter=${filter.id}`} />}
            >
              <Icon />
              <span>{filter.label}</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className="font-mono tabular-nums">{filter.count}</SidebarMenuBadge>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
