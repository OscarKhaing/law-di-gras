"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderOpenIcon, ScaleIcon } from "lucide-react";
import type { Tone } from "@/components/status";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { WORKLISTS, type ListedCase, type WorklistId } from "@/features/brief/schema";

/** How pressing a worklist is when it has a case on it. */
const TONE: Record<WorklistId, Tone> = { overdue: "urgent", provider: "mild", "other-side": "mild", limits: "mild", sol: "urgent" };

const COUNT: Record<Tone, string> = { urgent: "text-urgent-ink", mild: "text-mild-ink", done: "text-done-ink", neutral: "text-muted-foreground" };

/**
 * The firm's way around, and it is always about ALL the cases: the worklists say how many cases need
 * something (each one narrows the case list), then the cases themselves. What needs doing inside one
 * case is on that case's own menu, beside its brief. To keep the two apart, everything here is
 * counted in cases, and while a case is open the lists it is on are marked. The counts come from
 * what is stored, so they are as fresh as the last read of Clio.
 */
export function AppSidebar({ cases }: { cases: ListedCase[] }) {
  const pathname = usePathname();
  const show = useSearchParams().get("show");
  const onList = pathname === "/";
  // The case that is open, if any: /cases/<id>, or its fresh read at /cases/-<id>.
  const openId = Math.abs(Number(pathname.match(/^\/cases\/(-?\d+)/)?.[1] ?? 0));
  const openCase = cases.find((item) => item.matterId === openId);

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2 font-heading text-lg font-semibold tracking-tight">
          <ScaleIcon className="size-4.5 text-primary" />
          Case Desk
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Across all cases</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={onList && !show} render={<Link href="/" />}>
                  <FolderOpenIcon />
                  <span>All cases</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Cases that need attention</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKLISTS.map((list) => {
                const count = cases.filter((item) => item.lists.includes(list.id)).length;
                const includesOpen = openCase?.lists.includes(list.id) ?? false;
                return (
                  <SidebarMenuItem key={list.id}>
                    <SidebarMenuButton
                      isActive={onList && show === list.id}
                      title={includesOpen ? `${openCase?.client} is on this list` : undefined}
                      render={<Link href={`/?show=${list.id}`} />}
                    >
                      {/* A dot marks the lists the open case is on, tying this sidebar to the case beside it. */}
                      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${includesOpen ? "bg-primary" : "bg-transparent"}`} />
                      <span className={count === 0 ? "text-muted-foreground" : undefined}>
                        {list.label}
                        {includesOpen && <span className="sr-only"> (includes the case that is open)</span>}
                      </span>
                      <span className={`ml-auto text-xs whitespace-nowrap tabular-nums ${count > 0 ? `font-medium ${COUNT[TONE[list.id]]}` : "text-muted-foreground"}`}>
                        {count === 0 ? "none" : count === 1 ? "1 case" : `${count} cases`}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
            {openCase && openCase.lists.length > 0 && (
              <p className="flex items-center gap-2 px-2 pt-2 text-xs text-muted-foreground">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                Lists the open case is on
              </p>
            )}
          </SidebarGroupContent>
        </SidebarGroup>

        {cases.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Cases</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {cases.map((item) => (
                  <SidebarMenuItem key={item.matterId}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(`/cases/${item.matterId}`)}
                      className="h-auto py-1.5"
                      render={<Link href={`/cases/${item.matterId}`} />}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-serif text-[15px]">{item.client}</span>
                        <span className="truncate text-xs text-muted-foreground">{item.stage}</span>
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
