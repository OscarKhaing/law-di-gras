import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getBrief } from "@/features/brief/server";
import { clioMatterId } from "@/features/cases/schema";
import { getCaseFile } from "@/features/cases/server";
import { PrintButton } from "./print-controls";
import { HandoffSheet } from "./sheet";

// A case on one or two printed pages, for when it changes hands or the attorney wants a page in the
// file. It sits outside the firm's layout so nothing but the sheet is on the page. It reads what is
// stored and calls neither Clio nor a model.

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Handoff sheet", robots: { index: false, follow: false } };

// Letter paper with 0.4 inch margins. On screen the sheet has that width and those margins as
// padding, so what is seen is what prints.
const PAPER = "@page { size: letter; margin: 0.4in; } @media print { html, body { background: #fff; } }";

const linkClass = "underline underline-offset-2 hover:text-foreground";

export default async function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matterId = Number(id);
  // A negative id is a fresh read of that matter, a separate copy; anything but a whole number is no case.
  if (!Number.isInteger(matterId) || matterId === 0) {
    return (
      <Plain heading="There is no case at this address" back={{ href: "/", label: "Back to the cases" }}>
        A handoff sheet is opened from a case. Choose the case, then “Print a handoff sheet”.
      </Plain>
    );
  }
  const back = { href: `/cases/${matterId}`, label: "Back to the case" };

  let loaded: { file: Awaited<ReturnType<typeof getCaseFile>>; stored: Awaited<ReturnType<typeof getBrief>> } | null = null;
  try {
    const [file, stored] = await Promise.all([getCaseFile(matterId), getBrief(matterId)]);
    loaded = { file, stored };
  } catch (err) {
    console.error("[handoff] the case could not be loaded:", err);
  }

  if (!loaded) {
    return (
      <Plain heading="The handoff sheet could not be opened" back={back}>
        <span className="text-destructive">The database did not answer.</span> Nothing was lost. Reload the page; if it fails again, wait a
        minute and reload.
      </Plain>
    );
  }
  if (!loaded.file) {
    return (
      <Plain heading="This matter has not been read yet" back={back}>
        Matter {clioMatterId(matterId)} has not been read from Clio, so there is nothing to put on a sheet. Open the case and read it first.
      </Plain>
    );
  }
  if (!loaded.stored) {
    return (
      <Plain heading="This case has no brief yet" back={back}>
        The handoff sheet is made from the brief. Open the case, write the brief, then come back here.
      </Plain>
    );
  }

  // One "today" for the whole sheet, so its day counts agree.
  const today = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <main className="mx-auto w-full max-w-[8.5in] pb-10 print:max-w-none print:pb-0">
      <style>{PAPER}</style>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-sm text-muted-foreground print:hidden">
        <Link href={back.href} className={linkClass}>
          {back.label}
        </Link>
        <div className="flex items-center gap-3">
          <p>Letter paper, one or two pages. Nothing is sent to anyone.</p>
          <PrintButton />
        </div>
      </div>
      <div className="border bg-white p-[0.4in] shadow-xs max-[560px]:p-4 print:border-0 print:p-0 print:shadow-none">
        <HandoffSheet file={loaded.file} stored={loaded.stored} today={today} />
      </div>
    </main>
  );
}

function Plain({ heading, back, children }: { heading: string; back: { href: string; label: string }; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-12 sm:px-8 sm:py-20">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{heading}</h1>
      <p className="mt-2 leading-relaxed text-muted-foreground">{children}</p>
      <p className="mt-4 text-sm">
        <Link href={back.href} className={linkClass}>
          {back.label}
        </Link>
      </p>
    </main>
  );
}
