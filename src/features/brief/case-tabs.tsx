"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { CountBadge, StatusIcon, type Tone } from "@/components/status";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type CaseTab = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Counts beside the label, coloured by how pressing they are; zero counts are left out. */
  badges?: { tone: Tone; count: number; label: string }[];
  /** Starts a new group in the menu, set apart by space rather than a rule. */
  startsGroup?: boolean;
  content: ReactNode;
};

const OpenTab = createContext<(id: string) => void>(() => {});

/** Switch the case to another part, e.g. from a tile on the overview. */
export const useOpenTab = () => useContext(OpenTab);

// The open part has two cues, a tint and a short bar at its left edge, and keeps its weight so the
// menu does not shift. Touch screens get taller rows.
const itemClass = cn(
  "group/item relative flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left text-sm whitespace-nowrap text-muted-foreground outline-none transition-colors pointer-coarse:h-11",
  "hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
  "data-[active]:bg-primary/10 data-[active]:text-primary",
  "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:opacity-0 data-[active]:before:opacity-100",
  "[&_svg]:size-4 [&_svg]:shrink-0 lg:w-full",
);

/**
 * A case as a side column and a reading area. The side column holds who the case is about and a
 * menu of its parts, each with coloured counts; it stays in view while the reading area scrolls.
 * The open part is kept in the address (`?tab=money`), so Back, reload and a shared link land on
 * it. Every part stays mounted while hidden, so a search or a selection survives switching away.
 */
export function CaseTabs({ side, notice, tabs }: { side: ReactNode; notice?: ReactNode; tabs: CaseTab[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const start = useRef<HTMLDivElement>(null);
  const requested = params.get("tab");
  const active = tabs.some((tab) => tab.id === requested) ? requested! : tabs[0].id;

  function open(id: string) {
    if (id === active) return;
    const next = new URLSearchParams(params.toString());
    if (id === tabs[0].id) next.delete("tab");
    else next.set("tab", id);
    const query = next.toString();
    // The history API updates the address without asking the server for the page again.
    window.history.pushState(null, "", query ? `${pathname}?${query}` : pathname);
    // From far down a long part, come back up to the start of the new one.
    if (start.current && start.current.getBoundingClientRect().top < 0) start.current.scrollIntoView({ block: "start" });
  }

  return (
    <OpenTab.Provider value={open}>
      <Tabs
        value={active}
        onValueChange={(value) => open(String(value))}
        orientation="vertical"
        className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8"
      >
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-6">
          {side}
          <TabsPrimitive.List
            aria-label="Parts of the case"
            className="flex gap-0.5 overflow-x-auto rounded-2xl border bg-card p-1.5 shadow-xs lg:flex-col lg:overflow-visible"
          >
            {tabs.map((tab) => (
              <TabsPrimitive.Tab key={tab.id} value={tab.id} className={cn(itemClass, tab.startsGroup && "max-lg:ml-3 lg:mt-5")}>
                {tab.icon}
                <span className="flex-1">{tab.label}</span>
                {tab.badges
                  ?.filter((badge) => badge.count > 0)
                  .map((badge) => <CountBadge key={badge.label} tone={badge.tone} count={badge.count} label={badge.label} />)}
              </TabsPrimitive.Tab>
            ))}
          </TabsPrimitive.List>
        </aside>
        <div ref={start} className="min-w-0 scroll-mt-6 space-y-4">
          {notice}
          {tabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} keepMounted className="text-base">
              {tab.content}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </OpenTab.Provider>
  );
}

export type Tile = {
  tab: string;
  label: string;
  count: number;
  /** The colour when there is something to count; with nothing to count a tile is green. */
  tone: Tone;
  some: string;
  none: string;
};

const NUMBER: Record<Tone, string> = {
  urgent: "text-urgent-ink",
  mild: "text-mild-ink",
  done: "text-done-ink",
  neutral: "text-foreground",
};

// A tile is tinted only when it has something to count; an all-clear tile stays white.
const GROUND: Record<Tone, string> = {
  urgent: "border-urgent-ink/15 bg-urgent-soft/60",
  mild: "border-mild-ink/15 bg-mild-soft/60",
  done: "bg-card",
  neutral: "bg-card",
};

/** The case's state in four numbers, each opening the part that explains it. */
export function StatusTiles({ tiles }: { tiles: Tile[] }) {
  const open = useOpenTab();
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const tone = tile.count > 0 ? tile.tone : "done";
        return (
          <button
            key={tile.label}
            type="button"
            onClick={() => open(tile.tab)}
            className={cn(
              "group flex cursor-pointer flex-col items-start rounded-2xl border px-4 py-3.5 text-left shadow-xs outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50",
              GROUND[tone],
            )}
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusIcon tone={tone} className="size-4" />
              {tile.label}
            </span>
            <span className={cn("mt-1.5 block font-heading text-3xl font-semibold tabular-nums", NUMBER[tone])}>{tile.count}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground group-hover:text-foreground">
              {tile.count > 0 ? tile.some : tile.none}
            </span>
          </button>
        );
      })}
    </div>
  );
}
