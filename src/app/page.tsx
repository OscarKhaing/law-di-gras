import Link from "next/link";
import { CASES, shortDate } from "@/features/cases/data";
import { StageTrack } from "@/features/cases/stage-track";
import { StatusBadge } from "@/features/cases/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CasesPage() {
  const waiting = CASES.filter((c) => c.status !== "on_track").length;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Cases</h1>
        <p className="mt-1 text-muted-foreground">
          {CASES.length} open, {waiting} waiting on you.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-muted-foreground">Client</TableHead>
              <TableHead className="text-muted-foreground">Matter</TableHead>
              <TableHead className="text-muted-foreground">Stage</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="px-4 text-right text-muted-foreground">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CASES.map((c) => (
              <TableRow key={c.id} className="relative">
                <TableCell className="px-4 py-3 font-medium">
                  {/* The link's ::after covers the row, so the whole row opens the case. */}
                  <Link href={`/cases/${c.id}`} className="after:absolute after:inset-0">
                    {c.client}
                  </Link>
                </TableCell>
                <TableCell>{c.matter}</TableCell>
                <TableCell>
                  <StageTrack stage={c.stage} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="px-4 text-right text-muted-foreground tabular-nums">
                  {shortDate(c.updatedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
