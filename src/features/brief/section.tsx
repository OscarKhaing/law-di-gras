"use client";

import { Component, type ReactNode } from "react";
import { RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The small label every section of the brief starts with. */
export function SectionLabel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

/** A section of the brief: its label, its body, and a boundary so one failed section never blanks the page. */
export function Section({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex flex-col gap-3", className)}>
      <SectionLabel id={id}>{label}</SectionLabel>
      <SectionBoundary label={label}>{children}</SectionBoundary>
    </section>
  );
}

/** Muted words for a section with nothing in it. The section stays, so its absence is visible. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

type BoundaryState = { failed: Error | null };

class SectionBoundary extends Component<{ label: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { failed: null };

  static getDerivedStateFromError(failed: Error): BoundaryState {
    return { failed };
  }

  componentDidCatch(error: Error) {
    console.error(`[brief] ${this.props.label} could not be shown:`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="flex flex-col items-start gap-2 rounded-lg border border-danger/40 bg-card p-3 text-sm">
        <p>
          <span className="font-medium text-danger">This section could not be shown.</span>{" "}
          <span className="text-muted-foreground">{this.state.failed.message}</span>
        </p>
        <Button size="sm" variant="outline" onClick={() => this.setState({ failed: null })}>
          <RotateCcwIcon />
          Try again
        </Button>
      </div>
    );
  }
}
