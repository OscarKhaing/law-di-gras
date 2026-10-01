import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CASES } from "@/lib/mock-data";

export default function CasesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cases</h1>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Matter</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {CASES.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link href={`/cases/${c.id}`} className="hover:underline">
                    {c.client}
                  </Link>
                </TableCell>
                <TableCell>{c.matter}</TableCell>
                <TableCell>{c.stage}</TableCell>
                <TableCell>
                  <StatusBadge status={c.status} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {c.updatedAt}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
