"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

// Two people open the same case for different reasons: the attorney to decide (what it is worth,
// what could hurt it, what is pending), the case manager to keep it moving (who to chase, what is
// overdue, who is treating). "Reading as" puts each reader's parts first. It is a reading
// preference kept in this browser, not a permission: there is no sign-in, every part stays in the
// menu for both, and a link that names a part opens that part whoever follows it.

export type Role = "attorney" | "case-manager";

export const ROLES: { id: Role; label: string }[] = [
  { id: "attorney", label: "Attorney" },
  { id: "case-manager", label: "Case manager" },
];

/**
 * The order of a case's parts for each reader, by the ids of the parts in brief-view.tsx. Each
 * inner list is one group of the menu, set apart by space: what this reader came for, the rest of
 * the brief, then the record itself. The first part is the one that opens when the address names
 * none. This is our reading of the two jobs; change it here once the firm has been asked.
 */
export const READING_ORDER: Record<Role, string[][]> = {
  attorney: [
    ["overview", "flags", "money"],
    ["timeline", "medical", "todo"],
    ["file", "about"],
  ],
  "case-manager": [
    ["todo", "medical", "timeline"],
    ["overview", "money", "flags"],
    ["file", "about"],
  ],
};

/** The reader assumed until the browser says otherwise, and on the server, which cannot know. */
const DEFAULT_ROLE: Role = "attorney";

/**
 * Parts in a reader's order, each marked when it starts a new group of the menu. A part the order
 * does not list keeps its place after the listed ones, and its own `startsGroup`.
 */
export function inReadingOrder<T extends { id: string; startsGroup?: boolean }>(role: Role, parts: T[]): (T & { startsGroup: boolean })[] {
  const listed = READING_ORDER[role].flatMap((group, groupIndex) =>
    group.flatMap((id, index) => {
      const part = parts.find((candidate) => candidate.id === id);
      return part ? [{ ...part, startsGroup: groupIndex > 0 && index === 0 }] : [];
    }),
  );
  const known = new Set(READING_ORDER[role].flat());
  const rest = parts.filter((part) => !known.has(part.id)).map((part) => ({ ...part, startsGroup: part.startsGroup === true }));
  const ordered = [...listed, ...rest];
  // The first part of the menu has nothing above it to be set apart from.
  return ordered.map((part, index) => (index === 0 ? { ...part, startsGroup: false } : part));
}

// ---- The choice, remembered per browser ----

const STORAGE_KEY = "case-desk.reading-as";
/** Told to this tab's own readers when the choice changes; the browser's "storage" event tells the other tabs. */
const CHANGED = "case-desk:reading-as";

const isRole = (value: unknown): value is Role => ROLES.some((role) => role.id === value);

function subscribe(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGED, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGED, notify);
  };
}

// Storage can be switched off (private windows, locked-down browsers): the switch then works for
// this page only and the default comes back on reload.
let unsaved: Role | null = null;

function remembered(): Role {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isRole(value) ? value : (unsaved ?? DEFAULT_ROLE);
  } catch {
    return unsaved ?? DEFAULT_ROLE;
  }
}

function remember(role: Role) {
  unsaved = role;
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    // Kept in `unsaved` for this page.
  }
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * Who is reading, and the way to change it. The server and the first paint in the browser both
 * use the default, so the page hydrates cleanly; the remembered choice is applied straight after.
 */
export function useRole(): [Role, (role: Role) => void] {
  const role = useSyncExternalStore(subscribe, remembered, () => DEFAULT_ROLE);
  return [role, remember];
}

/** The "Reading as" switch: two choices, the chosen one lifted, and one line on what it does not do. */
export function RoleSwitch({ role, onChange, className }: { role: Role; onChange: (role: Role) => void; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p id="reading-as" className="text-xs text-muted-foreground">
        Reading as
      </p>
      <div role="group" aria-labelledby="reading-as" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {ROLES.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === role}
            onClick={() => onChange(option.id)}
            className={cn(
              // Each choice is as wide as its words plus an equal share of the room left over.
              "h-7 flex-auto cursor-pointer rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground outline-none pointer-coarse:h-9",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
              "aria-pressed:bg-card aria-pressed:text-primary aria-pressed:shadow-xs",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-snug text-muted-foreground">This changes the order, not what you can see.</p>
    </div>
  );
}
