"use client";

import type { CheckedBrief } from "./schema";
import { CitationChips } from "./citation-chip";
import { Empty, Section } from "./section";

/** Where the case stands, in the model's own two or three sentences, followed by their sources. */
export function WhereItStands({ brief }: { brief: CheckedBrief }) {
  const text = brief.bottomLine.text.trim();
  return (
    <Section id="where-it-stands" label="Where it stands">
      {text ? (
        <p className="text-lg leading-relaxed text-pretty">
          {text} <CitationChips evidence={brief.bottomLine.evidence} />
        </p>
      ) : (
        <Empty>The brief does not say where the case stands. Regenerate the brief to write it.</Empty>
      )}
    </Section>
  );
}
