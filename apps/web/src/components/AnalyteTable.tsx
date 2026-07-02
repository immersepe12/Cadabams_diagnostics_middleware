import { Table, Grid } from "antd";

const { useBreakpoint } = Grid;

// Shared renderer for a report's structured analyte values (Crelio's
// reportFormatAndValues). Used by the ops BillShow results card and the patient
// portal's report detail so the two never diverge. Responsive: a compact stacked
// list on phones, a table on wider screens.

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

function nameOf(a: Analyte) { return (a.reportFormat as { testName?: string })?.testName ?? "—"; }
function unitOf(a: Analyte) { return (a.reportFormat as { testUnit?: string })?.testUnit ?? ""; }
function refOf(a: Analyte) {
  const rf = a.reportFormat as { lowerBoundMale?: string; upperBoundMale?: string; otherMale?: string } | undefined;
  if (!rf) return "";
  if (rf.otherMale && rf.otherMale !== "-") return rf.otherMale;
  return rf.lowerBoundMale && rf.upperBoundMale ? `${rf.lowerBoundMale} – ${rf.upperBoundMale}` : "";
}

export function AnalyteTable({ values }: { values: Analyte[] }) {
  const screens = useBreakpoint();
  const rows = analyteRows(values ?? []);
  if (!rows.length) return null;

  // Phone: stacked rows — no horizontal scroll, big readable values.
  if (!screens.md) {
    return (
      <div>
        {rows.map((a, i) => {
          const ref = refOf(a);
          return (
            <div key={i} style={{ padding: "10px 2px", borderBottom: i < rows.length - 1 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ color: "#595959", fontSize: 14 }}>{nameOf(a)}</span>
                <span style={{ fontWeight: 600, fontSize: 15, whiteSpace: "nowrap" }}>
                  {a.value ?? "—"} <span style={{ fontWeight: 400, color: "#8c8c8c", fontSize: 12 }}>{unitOf(a)}</span>
                </span>
              </div>
              {ref && <div style={{ color: "#a0a0a0", fontSize: 12, marginTop: 2 }}>Ref: {ref}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Table
      size="small"
      pagination={false}
      dataSource={rows.map((a, i) => ({ key: i, ...a }))}
      columns={[
        { title: "Analyte", render: (_: unknown, a: Analyte) => nameOf(a) },
        { title: "Value", width: 120, render: (_: unknown, a: Analyte) => <strong>{a.value ?? "—"}</strong> },
        { title: "Unit", width: 90, render: (_: unknown, a: Analyte) => unitOf(a) },
        { title: "Reference", width: 160, render: (_: unknown, a: Analyte) => refOf(a) },
      ]}
    />
  );
}
