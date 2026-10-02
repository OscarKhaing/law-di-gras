"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FolderOpenIcon, ScaleIcon } from "lucide-react";
import { CountBadge, type Tone } from "@/components/status";
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

/**
 * The firm's way around: the cases, the worklists that say which of them need something (each one
 * narrows the case list), and the cases themselves. The counts come from what is stored, so they
 * are as fresh as the last read of Clio.
 */
export function AppSidebar({ cases }: { cases: ListedCase[] }) {
  const pathname = usePathname();
  const show = useSearchParams().get("show");
  const onList = pathname === "/";

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
          <SidebarGroupLabel>Needs attention</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKLISTS.map((list) => {
                const count = cases.filter((item) => item.lists.includes(list.id)).length;
                return (
                  <SidebarMenuItem key={list.id}>
                    <SidebarMenuButton isActive={onList && show === list.id} render={<Link href={`/?show=${list.id}`} />}>
                      <span className={count === 0 ? "text-muted-foreground" : undefined}>{list.label}</span>
                      <span className="ml-auto">
                        {count > 0 ? (
                          <CountBadge tone={TONE[list.id]} count={count} label={count === 1 ? "case" : "cases"} />
                        ) : (
                          <span className="pr-1.5 text-xs text-muted-foreground tabular-nums">0</span>
                        )}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {cases.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Cases read</SidebarGroupLabel>
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
