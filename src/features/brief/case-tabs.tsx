"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useContext, useRef, type ReactNode } from "react";
import { CountBadge, StatusIcon, type Tone } from "@/components/status";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { RoleSwitch, inReadingOrder, useRole } from "./role";
import { useChanges } from "./arrived";

export type CaseTab = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Counts beside the label, coloured by how pressing they are; zero counts are left out. */
  badges?: { tone: Tone; count: number; label: string }[];
  /**
   * Starts a new group in the menu, set apart by space rather than a rule. The groups now come from
   * the reader's order (READING_ORDER in role.tsx); this is used only for a part that order does not list.
   */
  startsGroup?: boolean;
  content: ReactNode;
};

const OpenTab = createContext<(id: string, look?: string) => void>(() => {});

/**
 * Bring the reader's eye to what a tile counted: scroll to the elements marked `data-look={look}` in
 * the part now open, and flash them once. Runs after the part is shown, since the address change
 * that shows it renders a moment later.
 */
function lookAt(look: string) {
  window.setTimeout(() => {
    const found = [...document.querySelectorAll<HTMLElement>(`[data-look="${look}"]`)].filter((element) => !element.closest("[hidden]"));
    if (found.length === 0) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    found[0].scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    for (const element of found) {
      element.classList.remove("look-here");
      void element.offsetWidth; // restart the flash if it is already playing
      element.classList.add("look-here");
    }
    window.setTimeout(() => found.forEach((element) => element.classList.remove("look-here")), 2000);
  }, 80);
}

/** Switch the case to another part, e.g. from a tile on the overview, optionally to what it counted. */
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
 * menu of its parts, each with coloured counts; the menu stays in view while the reading area scrolls.
 * The open part is kept in the address (`?tab=money`), so Back, reload and a shared link land on
 * it. Every part stays mounted while hidden, so a search or a selection survives switching away.
 *
 * "Reading as" above the menu puts the parts in the reader's order and decides which one opens
 * when the address names none. It never removes a part, and a part named in the address wins.
 *
 * The menu is headed "In this case" and its counts say so too, because the firm's sidebar beside
 * it lists the same kinds of things (overdue, waiting) counted across every case.
 */
export function CaseTabs({ side, notice, tabs }: { side: ReactNode; notice?: ReactNode; tabs: CaseTab[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const start = useRef<HTMLDivElement>(null);
  const [role, setRole] = useRole();
  const menu = inReadingOrder(role, tabs);
  const requested = params.get("tab");
  const active = menu.some((tab) => tab.id === requested) ? requested! : menu[0].id;

  function open(id: string, look?: string) {
    if (look) lookAt(look);
    if (id === active) return;
    const next = new URLSearchParams(params.toString());
    // A part the reader chose is always named in the address, the first one too: which part is
    // first depends on who is reading, and a link must open the same part for whoever follows it.
    next.set("tab", id);
    // The history API updates the address without asking the server for the page again.
    window.history.pushState(null, "", `${pathname}?${next.toString()}`);
    // From far down a long part, come back up to the start of the new one (unless a tile chose where to look).
    if (!look && start.current && start.current.getBoundingClientRect().top < 0) start.current.scrollIntoView({ block: "start" });
  }

  return (
    <OpenTab.Provider value={open}>
      <Tabs
        value={active}
        onValueChange={(value) => open(String(value))}
        orientation="vertical"
        className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8"
      >
        {/*
          The whole column stays pinned beside the reading area and scrolls on its own when it is
          taller than the window, so who the case is about, the role switch and the menu can all be
          reached without losing one's place in the part being read. Reaching its end does not carry
          on into the page.
        */}
        <aside className="min-w-0 space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:overflow-y-auto lg:overscroll-contain lg:px-0.5 lg:pb-1 lg:[scrollbar-width:thin]">
          {side}
          <div className="rounded-2xl border bg-card shadow-xs">
            <RoleSwitch role={role} onChange={setRole} className="border-b p-3" />
            {/* The firm's sidebar counts cases across the whole firm; this menu and its counts are
                about the one case that is open. The label says so, in the same quiet words the
                sidebar uses over its own lists. */}
            <p id="case-parts" className="px-4.5 pt-3 text-xs text-muted-foreground">
              In this case
            </p>
            <TabsPrimitive.List aria-labelledby="case-parts" className="flex gap-0.5 overflow-x-auto p-1.5 lg:flex-col lg:overflow-visible">
              {menu.map((tab) => (
                <TabsPrimitive.Tab key={tab.id} value={tab.id} className={cn(itemClass, tab.startsGroup && "max-lg:ml-3 lg:mt-4")}>
                  {tab.icon}
                  <span className="flex-1">{tab.label}</span>
                  {tab.badges
                    ?.filter((badge) => badge.count > 0)
                    .map((badge) => (
                      <CountBadge key={badge.label} tone={badge.tone} count={badge.count} label={`${badge.label} in this case`} />
                    ))}
                </TabsPrimitive.Tab>
              ))}
            </TabsPrimitive.List>
          </div>
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

/** A tile's number; when a "Check Clio" moves it, it flashes so the change is not missed. */
function TileCount({ count, className }: { count: number; className: string }) {
  const changes = useChanges(count);
  return (
    <span
      key={changes}
      className={cn("mt-1.5 block font-heading text-3xl font-semibold tabular-nums", changes > 0 && "look-here", className)}
    >
      {count}
    </span>
  );
}

export type Tile = {
  tab: string;
  /** What the tile counts, marked `data-look` in that part: the reader is taken straight to it. */
  look?: string;
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
            onClick={() => open(tile.tab, tile.look)}
            className={cn(
              "group flex cursor-pointer flex-col items-start rounded-2xl border px-4 py-3.5 text-left shadow-xs outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring/50",
              GROUND[tone],
            )}
          >
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <StatusIcon tone={tone} className="size-4" />
              {tile.label}
            </span>
            <TileCount count={tile.count} className={NUMBER[tone]} />
            <span className="mt-0.5 block text-xs text-muted-foreground group-hover:text-foreground">
              {tile.count > 0 ? tile.some : tile.none}
            </span>
          </button>
        );
      })}
    </div>
  );
}
