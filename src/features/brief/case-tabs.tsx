"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { CountBadge, StatusDot, type Tone } from "@/components/status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type CaseTab = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Counts beside the label, coloured by how pressing they are; zero counts are left out. */
  badges?: { tone: Tone; count: number; label: string }[];
  content: ReactNode;
};

const OpenTab = createContext<(id: string) => void>(() => {});

/** Switch the case to another tab, e.g. from a tile on the overview. */
export const useOpenTab = () => useContext(OpenTab);

/**
 * A case split into tabs, one subject each, so nobody has to scroll through the whole brief. The
 * open tab is kept in the address (`?tab=money`), so Back, reload and a shared link all land on it.
 * Every tab stays mounted while hidden, so a search or a selection survives switching away.
 */
export function CaseTabs({ tabs }: { tabs: CaseTab[] }) {
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
    // From far down a long tab, come back up to the start of the new one.
    if (start.current && start.current.getBoundingClientRect().top < 0) start.current.scrollIntoView({ block: "start" });
  }

  return (
    <OpenTab.Provider value={open}>
      <div ref={start} className="scroll-mt-2" />
      <Tabs value={active} onValueChange={(value) => open(String(value))} className="gap-0">
        <div className="sticky top-0 z-20 -mx-6 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <TabsList variant="line" aria-label="Parts of the case" className="h-auto w-full justify-start gap-1 overflow-x-auto py-1">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="h-9 flex-none gap-2 px-2.5 text-[13px] after:bg-primary data-active:text-foreground"
              >
                {tab.icon}
                {tab.label}
                {tab.badges
                  ?.filter((badge) => badge.count > 0)
                  .map((badge) => <CountBadge key={badge.label} tone={badge.tone} count={badge.count} label={badge.label} />)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} keepMounted className="pt-8 text-base">
            {tab.content}
          </TabsContent>
        ))}
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

/** The case's state in four numbers, each opening the tab that explains it. */
export function StatusTiles({ tiles }: { tiles: Tile[] }) {
  const open = useOpenTab();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => {
        const tone = tile.count > 0 ? tile.tone : "done";
        return (
          <button
            key={tile.label}
            type="button"
            onClick={() => open(tile.tab)}
            className="group flex cursor-pointer flex-col items-start rounded-lg border bg-card px-4 py-3.5 text-left outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusDot tone={tone} />
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
