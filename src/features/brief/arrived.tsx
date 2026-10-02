"use client";

import { useState } from "react";

/**
 * The entries that were not in the case file the first time this rendered: what a "Check Clio" just
 * brought in. Keeps what it has seen across the page's refresh, so only new arrivals are marked.
 */
export function useArrived(refs: string[]): Set<string> {
  const key = refs.join("|");
  const [seen, setSeen] = useState(() => ({ key, known: new Set(refs), arrived: new Set<string>() }));
  if (seen.key !== key) {
    // Stored from the previous render, as React recommends for props that change.
    setSeen({ key, known: new Set([...seen.known, ...refs]), arrived: new Set(refs.filter((ref) => !seen.known.has(ref))) });
  }
  return seen.arrived;
}

/** How many times `value` has changed since the first render: a new count replays its flash. */
export function useChanges(value: number) {
  const [state, setState] = useState({ value, changes: 0 });
  if (state.value !== value) setState({ value, changes: state.changes + 1 });
  return state.changes;
}
