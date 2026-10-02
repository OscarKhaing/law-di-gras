"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import {
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  FlexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SolCountdown } from "@/components/sol-countdown";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, usd } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { FILTERS, isFilter, matches, type MatterRow } from "./schema";

const features = tableFeatures({ columnVisibilityFeature, rowSortingFeature, sortedRowModel: createSortedRowModel() });
const column = createColumnHelper<typeof features, MatterRow>();

const muted = <span className="text-muted-foreground">Not read yet</span>;
// Unread matters sort last whichever way a column is sorted.
const last = "last" as const;

const columns = column.columns([
  column.accessor("client", {
    header: "Client",
    cell: ({ row }) => (
      // The link's ::after covers the row, so the whole row opens the brief and is one tab stop.
      <Link
        href={`/cases/${row.original.matterId}`}
        className="rounded-sm font-medium outline-none after:absolute after:inset-0 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {row.original.client || "Client not named in Clio"}
      </Link>
    ),
  }),
  column.accessor("number", {
    header: "Matter",
    cell: ({ getValue }) => <span className="font-mono text-sm">{getValue()}</span>,
  }),
  column.accessor("stage", {
    header: "Stage",
    cell: ({ getValue }) => (getValue() ? <Badge variant="outline">{getValue()}</Badge> : <span className="text-muted-foreground">None</span>),
  }),
  column.accessor((row) => row.injuryDate || undefined, {
    id: "injury",
    header: "Date of injury",
    sortUndefined: last,
    cell: ({ row }) =>
      row.original.read ? <span className="font-mono text-sm">{formatDate(row.original.injuryDate) || "Not in the file"}</span> : muted,
  }),
  column.accessor((row) => (row.solSatisfied ? undefined : (row.solDays ?? undefined)), {
    id: "sol",
    header: "SOL",
    sortUndefined: last,
    cell: ({ row }) =>
      row.original.read ? (
        <SolCountdown sol={row.original.sol} days={row.original.solDays} satisfied={row.original.solSatisfied} className="text-sm" />
      ) : (
        muted
      ),
  }),
  column.accessor((row) => (row.specials !== null && row.limits ? row.specials / row.limits : undefined), {
    id: "limits",
    header: "Specials vs. limits",
    sortUndefined: last,
    cell: ({ row }) => {
      const { specials, limits, read } = row.original;
      if (!read) return muted;
      if (specials === null && limits === null) return <span className="text-muted-foreground">Not in the brief</span>;
      const over = specials !== null && limits !== null && specials > limits;
      return (
        <span className="font-mono text-sm tabular-nums">
          {specials !== null ? usd(specials) : "?"}
          <span className="text-muted-foreground"> / {limits !== null ? usd(limits) : "?"}</span>
          {over && <span className="ml-1.5 text-warning">over</span>}
        </span>
      );
    },
  }),
  column.accessor((row) => row.waitingOn.length || undefined, {
    id: "waiting",
    header: "Waiting on",
    sortUndefined: last,
    cell: ({ row }) =>
      row.original.read ? (
        row.original.waitingOn.length ? (
          <span className="flex flex-wrap gap-1">
            {row.original.waitingOn.map((party) => (
              <Badge key={party} variant="secondary">
                {party}
              </Badge>
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Nobody</span>
        )
      ) : (
        muted
      ),
  }),
  column.accessor((row) => (row.read ? row.overdue : undefined), {
    id: "overdue",
    header: "Overdue",
    sortUndefined: last,
    sortDescFirst: true,
    cell: ({ row }) =>
      row.original.read ? (
        <span className={cn("font-mono text-sm tabular-nums", row.original.overdue > 0 ? "text-danger" : "text-muted-foreground")}>
          {row.original.overdue > 0 ? `${row.original.overdue} overdue` : "0"}
        </span>
      ) : (
        muted
      ),
  }),
  column.accessor((row) => row.lastActivity || undefined, {
    id: "activity",
    header: "Last activity",
    sortUndefined: last,
    sortDescFirst: true,
    cell: ({ row }) => (row.original.read ? <span className="font-mono text-sm">{formatDate(row.original.lastActivity)}</span> : muted),
  }),
]);

/** Every matter in Clio, one row each. Sorting and filtering happen here, on what the server loaded. */
export function MattersTable({ rows }: { rows: MatterRow[] }) {
  const searchParams = useSearchParams();
  const raw = searchParams.get("filter");
  const filter = isFilter(raw) ? raw : "all";
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);

  const needle = query.trim().toLowerCase();
  const data = useMemo(
    () =>
      rows
        .filter((row) => matches(row, filter))
        .filter((row) => !needle || `${row.client} ${row.number} ${row.description}`.toLowerCase().includes(needle)),
    [rows, filter, needle],
  );

  const table = useTable({
    features,
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (row) => String(row.matterId),
  });
  const label = FILTERS.find((item) => item.id === filter)?.label ?? "All matters";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {label}: <span className="font-mono tabular-nums">{data.length}</span>
          {filter !== "all" && (
            <>
              {" "}
              <Link href="/" className="ml-1 text-primary underline-offset-4 hover:underline">
                Show all matters
              </Link>
            </>
          )}
        </p>
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by client or matter number"
          aria-label="Filter by client or matter number"
          className="w-full bg-card sm:w-72"
        />
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/60">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted();
                  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                      className="first:pl-4 last:pr-4"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 gap-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <FlexRender header={header} />
                        <Icon className={cn("size-3", !sorted && "opacity-40")} />
                      </Button>
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="relative">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 first:pl-4 last:pr-4">
                      <FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  {needle ? `No matter matches “${query.trim()}”.` : `No matter is ${label.toLowerCase()} right now.`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
