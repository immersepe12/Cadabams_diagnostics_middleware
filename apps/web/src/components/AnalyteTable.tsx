import { Table } from "antd";

// Shared renderer for a report's structured analyte values (Crelio's
// reportFormatAndValues). Used by the ops BillShow results card and the patient
// portal's report detail so the two never diverge.

export type Analyte = {
  value?: string;
  reportFormat?: {
    testName?: string; testUnit?: string;
    lowerBoundMale?: string; upperBoundMale?: string; otherMale?: string;
    descriptionFlag?: number;
  } | unknown;
};

// Keep only real analyte rows: drop free-text/description blocks (descriptionFlag
// === 1) and rows without a testName.
export function analyteRows(sv: Analyte[]): Analyte[] {
  return sv.filter(
    (a) => a.reportFormat && !Array.isArray(a.reportFormat) &&
      (a.reportFormat as { descriptionFlag?: number }).descriptionFlag !== 1 &&
      (a.reportFormat as { testName?: string }).testName,
  );
}

export function AnalyteTable({ values }: { values: Analyte[] }) {
  const rows = analyteRows(values ?? []);
  if (!rows.length) return null;
  return (
    <Table
      size="small"
      pagination={false}
      dataSource={rows.map((a, i) => ({ key: i, ...a }))}
      columns={[
        { title: "Analyte", render: (_: unknown, a: Analyte) => (a.reportFormat as { testName?: string })?.testName ?? "—" },
        { title: "Value", width: 120, render: (_: unknown, a: Analyte) => <strong>{a.value ?? "—"}</strong> },
        { title: "Unit", width: 90, render: (_: unknown, a: Analyte) => (a.reportFormat as { testUnit?: string })?.testUnit ?? "" },
        {
          title: "Reference", width: 160,
          render: (_: unknown, a: Analyte) => {
            const rf = a.reportFormat as { lowerBoundMale?: string; upperBoundMale?: string; otherMale?: string } | undefined;
            if (!rf) return "";
            if (rf.otherMale && rf.otherMale !== "-") return rf.otherMale;
            return rf.lowerBoundMale && rf.upperBoundMale ? `${rf.lowerBoundMale} – ${rf.upperBoundMale}` : "";
          },
        },
      ]}
    />
  );
}
