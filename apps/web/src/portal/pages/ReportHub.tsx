import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Tag, Button, Typography, Input, Empty, Spin, Collapse, Segmented, message } from "antd";
import { FileTextOutlined, FilePdfOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { getReportPdfUrl } from "../lib/portalApi";

// Longitudinal report hub. Reads `reports` directly — RLS scopes the rows to the
// signed-in patient's mobile. Reports are append-only, so the same test across
// visits (and amendments) yields multiple rows; we group by test and show the
// latest first with the full history collapsed beneath. Mobile-first: one column
// of cards, big tap targets, no data tables.

type Report = {
  id: string;
  crelio_test_id: string | null;
  test_name: string | null;
  report_url: string | null;
  pdf_blob_ref: string | null;
  structured_values: unknown[] | null;
  signing_doctor: string | null;
  reported_at: string | null;
  is_amended: boolean;
  created_at: string;
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
}
const hasStructured = (r: Report) => Array.isArray(r.structured_values) && r.structured_values.length > 0;
const hasPdf = (r: Report) => !!(r.pdf_blob_ref || r.report_url);

type GroupMode = "test" | "visit" | "doctor";

export function ReportHub() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<GroupMode>("test");
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    supabaseClient
      .from("reports")
      .select("id, crelio_test_id, test_name, report_url, pdf_blob_ref, structured_values, signing_doctor, reported_at, is_amended, created_at")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) message.error(error.message);
        setReports((data as Report[]) ?? []);
        setLoading(false);
      });
  }, []);

  // Grouping — by Test (default: version history per test), by Visit (date), or
  // by Doctor. Rows are already newest-first (query ordered created_at desc).
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const keyOf = (r: Report): string => {
      if (mode === "visit") return fmtDate(r.reported_at ?? r.created_at);
      if (mode === "doctor") return r.signing_doctor ?? "Doctor not specified";
      return r.crelio_test_id ?? r.test_name ?? r.id;
    };
    const map = new Map<string, Report[]>();
    for (const r of reports) {
      if (term && !(r.test_name ?? "").toLowerCase().includes(term)) continue;
      const key = keyOf(r);
      (map.get(key) ?? map.set(key, []).get(key)!).push(r);
    }
    return [...map.entries()].sort(
      (a, b) => new Date(b[1][0].created_at).getTime() - new Date(a[1][0].created_at).getTime(),
    );
  }, [reports, q, mode]);

  async function openPdf(r: Report) {
    setOpening(r.id);
    try {
      window.open(await getReportPdfUrl(r.id), "_blank");
    } catch (err) {
      message.error((err as Error)?.message ?? "Could not open report");
    } finally {
      setOpening(null);
    }
  }

  function primaryActions(r: Report) {
    return (
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {hasPdf(r) && (
          <Button type="primary" size="large" icon={<FilePdfOutlined />} loading={opening === r.id}
            onClick={() => openPdf(r)} style={{ flex: 1 }}>
            Open PDF
          </Button>
        )}
        {hasStructured(r) && (
          <Button size="large" icon={<FileTextOutlined />} onClick={() => navigate(`/portal/reports/${r.id}`)}
            style={{ flex: hasPdf(r) ? "0 0 auto" : 1 }}>
            Results
          </Button>
        )}
      </div>
    );
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin size="large" /></div>;

  // Compact row used inside visit/doctor groups (and the per-test history).
  function reportRow(v: Report, primaryLine: string, secondaryLine?: string | null) {
    return (
      <div key={v.id} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        gap: 8, padding: "10px 0", borderTop: "1px solid #f0f0f0",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14 }}>
            {primaryLine}
            {v.is_amended && <Tag color="orange" style={{ marginLeft: 6 }}>amended</Tag>}
          </div>
          {secondaryLine && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{secondaryLine}</Typography.Text>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {hasStructured(v) && (
            <Button size="middle" icon={<FileTextOutlined />} onClick={() => navigate(`/portal/reports/${v.id}`)} />
          )}
          {hasPdf(v) && (
            <Button size="middle" type="primary" icon={<FilePdfOutlined />} loading={opening === v.id} onClick={() => openPdf(v)} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <Typography.Title level={4} style={{ margin: "0 0 12px" }}>My Reports</Typography.Title>
      <Input.Search
        placeholder="Search reports"
        allowClear
        size="large"
        style={{ marginBottom: 12 }}
        onChange={(e) => setQ(e.target.value)}
      />
      <Segmented
        block
        value={mode}
        onChange={(v) => setMode(v as GroupMode)}
        options={[
          { value: "test", label: "By test" },
          { value: "visit", label: "By visit" },
          { value: "doctor", label: "By doctor" },
        ]}
        style={{ marginBottom: 16 }}
      />

      {groups.length === 0 ? (
        <Empty description={q ? "No matching reports" : "No reports yet"} style={{ marginTop: 64 }} />
      ) : mode === "test" ? (
        groups.map(([, versions]) => {
          const latest = versions[0];
          const earlier = versions.slice(1);
          return (
            <Card
              key={latest.crelio_test_id ?? latest.test_name ?? latest.id}
              style={{ marginBottom: 12, borderRadius: 12 }}
              styles={{ body: { padding: 16 } }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text strong style={{ fontSize: 16, display: "block" }}>
                    {latest.test_name ?? "Report"}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {fmtDate(latest.reported_at ?? latest.created_at)}
                    {latest.signing_doctor ? ` · ${latest.signing_doctor}` : ""}
                  </Typography.Text>
                </div>
                {latest.is_amended && <Tag color="orange" style={{ margin: 0 }}>amended</Tag>}
              </div>

              {primaryActions(latest)}

              {earlier.length > 0 && (
                <Collapse
                  ghost
                  size="small"
                  style={{ marginTop: 4 }}
                  items={[{
                    key: "history",
                    label: `${earlier.length} earlier report${earlier.length > 1 ? "s" : ""}`,
                    children: (
                      <div>
                        {earlier.map((v) => reportRow(v, fmtDate(v.reported_at ?? v.created_at), v.signing_doctor))}
                      </div>
                    ),
                  }]}
                />
              )}
            </Card>
          );
        })
      ) : (
        groups.map(([label, rows]) => (
          <Card
            key={label}
            title={<span style={{ fontSize: 15 }}>{label}</span>}
            extra={<Tag style={{ margin: 0 }}>{rows.length}</Tag>}
            style={{ marginBottom: 12, borderRadius: 12 }}
            styles={{ body: { padding: "4px 16px 8px" } }}
          >
            {rows.map((v) =>
              reportRow(
                v,
                v.test_name ?? "Report",
                mode === "visit" ? v.signing_doctor : fmtDate(v.reported_at ?? v.created_at),
              ),
            )}
          </Card>
        ))
      )}
    </div>
  );
}
