"use client";

import { useState, type ReactNode } from "react";

/** How many rows of a long ledger show before "Show all N", so the brief reads in 90 seconds. */
export const FIRST = 5;

/** The first `first` items, and the "Show all N" control for the rest (null when nothing is hidden). */
export function useFirst<T>(items: T[], first = FIRST): { shown: T[]; more: ReactNode } {
  const [all, setAll] = useState(false);
  if (all || items.length <= first) return { shown: items, more: null };
  return {
    shown: items.slice(0, first),
    more: (
      <button
        type="button"
        onClick={() => setAll(true)}
        className="cursor-pointer rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        Show all {items.length}
      </button>
    ),
  };
}
