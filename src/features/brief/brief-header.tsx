import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import type { CaseFile } from "@/features/cases/schema";
import { StageTrack } from "@/features/cases/stage-track";

/** Who the case is for, where it stands among Clio's stages, and when it was last read from Clio. */
export function BriefHeader({ file }: { file: CaseFile }) {
  return (
    <header className="space-y-3">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground hover:underline">
          Cases
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{file.client.name}</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">{file.client.name}</h1>
        {/* Wired once lane 1's sync route exists. */}
        <Button variant="outline" size="sm" className="bg-card" disabled title="Reading a case again from Clio is not connected yet">
          <RefreshCwIcon />
          Check Clio
        </Button>
      </div>
      {file.description && <p className="font-serif text-lg leading-snug">{file.description}</p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>{file.number}</span>
        <StageTrack stage={file.stage} stages={file.stages} />
        <span>
          Read from Clio <LocalTime iso={file.syncedAt} />
        </span>
      </div>
    </header>
  );
}
