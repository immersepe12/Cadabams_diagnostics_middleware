import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Button, Space, Typography, Tag, Spin, Empty, message } from "antd";
import { ArrowLeftOutlined, FilePdfOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { getReportPdfUrl } from "../lib/portalApi";
import { AnalyteTable, type Analyte } from "../../components/AnalyteTable";

// Structured view of one report. The fetch is RLS-scoped, so a report the
// patient doesn't own simply returns no row (→ "not found").

type Report = {
  id: string;
  test_name: string | null;
  signing_doctor: string | null;
  reported_at: string | null;
  created_at: string;
  is_amended: boolean;
  report_url: string | null;
  pdf_blob_ref: string | null;
  structured_values: Analyte[] | null;
};

function fmtDate(v: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(v));
}

export function ReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabaseClient
      .from("reports")
      .select("id, test_name, signing_doctor, reported_at, created_at, is_amended, report_url, pdf_blob_ref, structured_values")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) message.error(error.message);
        setReport((data as Report) ?? null);
        setLoading(false);
      });
  }, [id]);

  async function openPdf() {
    if (!report) return;
    setOpening(true);
    try {
      window.open(await getReportPdfUrl(report.id), "_blank");
    } catch (err) {
      message.error((err as Error)?.message ?? "Could not open report");
    } finally {
      setOpening(false);
    }
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin /></div>;

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/portal")} />
        <Typography.Title level={4} style={{ margin: 0 }}>
          {report?.test_name ?? "Report"}
        </Typography.Title>
        {report?.is_amended && <Tag color="orange">amended</Tag>}
      </Space>

      {!report ? (
        <Empty description="Report not found" style={{ marginTop: 64 }} />
      ) : (
        <Card
          title={
            <Space split="·">
              <span>{fmtDate(report.reported_at ?? report.created_at)}</span>
              {report.signing_doctor && <Typography.Text type="secondary">{report.signing_doctor}</Typography.Text>}
            </Space>
          }
          extra={
            (report.pdf_blob_ref || report.report_url) && (
              <Button type="primary" icon={<FilePdfOutlined />} loading={opening} onClick={openPdf}>
                Open PDF
              </Button>
            )
          }
        >
          {Array.isArray(report.structured_values) && report.structured_values.length > 0 ? (
            <AnalyteTable values={report.structured_values} />
          ) : (
            <Typography.Text type="secondary">
              No structured values for this report. Use “Open PDF” to view the full report.
            </Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}
