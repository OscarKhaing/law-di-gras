// Placeholder rows so the shell renders. Replace with real queries once the data model is designed.
export type CaseStatus = "on_track" | "needs_review" | "blocked";

export type Case = {
  id: string;
  client: string;
  matter: string;
  stage: string;
  status: CaseStatus;
  updatedAt: string;
};

export const CASES: Case[] = [
  {
    id: "c-1001",
    client: "Riley Sample",
    matter: "Motor vehicle collision",
    stage: "Treatment",
    status: "on_track",
    updatedAt: "2026-09-29",
  },
  {
    id: "c-1002",
    client: "Morgan Placeholder",
    matter: "Slip and fall",
    stage: "Records & bills",
    status: "needs_review",
    updatedAt: "2026-09-24",
  },
  {
    id: "c-1003",
    client: "Casey Example",
    matter: "Rideshare collision",
    stage: "Demand",
    status: "blocked",
    updatedAt: "2026-09-12",
  },
];
