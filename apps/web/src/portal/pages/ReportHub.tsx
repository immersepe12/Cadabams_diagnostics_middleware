import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Table, Tag, Button, Space, Typography, Input, Empty, Spin, message } from "antd";
import { FileTextOutlined, FilePdfOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { getReportPdfUrl } from "../lib/portalApi";

// Longitudinal report hub. Reads `reports` directly — RLS scopes the rows to the
// signed-in patient's mobile. Reports are append-only, so the same test across
// visits (and amendments) yields multiple rows; we group by test and show the
// latest first with the full history beneath.

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

export function ReportHub() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
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

  // Group by test (crelio_test_id, falling back to name). Each group is already
  // newest-first because the source query is ordered by created_at desc.
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byTest = new Map<string, Report[]>();
    for (const r of reports) {
      if (term && !(r.test_name ?? "").toLowerCase().includes(term)) continue;
      const key = r.crelio_test_id ?? r.test_name ?? r.id;
      (byTest.get(key) ?? byTest.set(key, []).get(key)!).push(r);
    }
    return [...byTest.values()].sort(
      (a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime(),
    );
  }, [reports, q]);

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

  function hasStructured(r: Report) {
    return Array.isArray(r.structured_values) && r.structured_values.length > 0;
  }
  function hasPdf(r: Report) {
    return !!(r.pdf_blob_ref || r.report_url);
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin /></div>;

  return (
    <div>
      <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>My Reports</Typography.Title>
        <Input.Search
          placeholder="Filter by test name"
          allowClear
          style={{ maxWidth: 280 }}
          onChange={(e) => setQ(e.target.value)}
        />
      </Space>

      {groups.length === 0 ? (
        <Empty description="No reports yet" style={{ marginTop: 64 }} />
      ) : (
        groups.map((versions) => {
          const latest = versions[0];
          return (
            <Card
              key={latest.crelio_test_id ?? latest.test_name ?? latest.id}
              style={{ marginBottom: 16 }}
              title={
                <Space>
                  <span>{latest.test_name ?? "Report"}</span>
                  {latest.is_amended && <Tag color="orange">amended</Tag>}
                </Space>
              }
              extra={<Typography.Text type="secondary">{fmtDate(latest.reported_at ?? latest.created_at)}</Typography.Text>}
            >
              <Table<Report>
                dataSource={versions}
                rowKey="id"
                size="small"
                pagination={false}
                showHeader={versions.length > 1}
              >
                <Table.Column<Report>
                  title="Reported"
                  dataIndex="reported_at"
                  render={(v: string | null, r) => fmtDate(v ?? r.created_at)}
                />
                <Table.Column<Report>
                  title="Reporting doctor"
                  dataIndex="signing_doctor"
                  render={(v: string | null) => v ?? "—"}
                />
                <Table.Column<Report>
                  title=""
                  width={70}
                  render={(_, r) => (r.is_amended ? <Tag color="orange">amended</Tag> : null)}
                />
                <Table.Column<Report>
                  title="Actions"
                  width={200}
                  align="right"
                  render={(_, r) => (
                    <Space>
                      {hasStructured(r) && (
                        <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/portal/reports/${r.id}`)}>
                          Results
                        </Button>
                      )}
                      {hasPdf(r) && (
                        <Button
                          size="small" type="primary" icon={<FilePdfOutlined />}
                          loading={opening === r.id} onClick={() => openPdf(r)}
                        >
                          PDF
                        </Button>
                      )}
                    </Space>
                  )}
                />
              </Table>
            </Card>
          );
        })
      )}
    </div>
  );
}
