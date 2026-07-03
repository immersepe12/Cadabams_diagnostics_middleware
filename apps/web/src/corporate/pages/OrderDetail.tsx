import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Tag, Button, Space, Typography, Descriptions, Spin, Empty, message } from "antd";
import { ArrowLeftOutlined, FilePdfOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { getCorporatePdfUrl } from "../lib/corporateApi";
import { AnalyteTable, type Analyte } from "../../components/AnalyteTable";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};
const CENTRE: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};

type Order = {
  id: string; order_number: string; centre_id: string; created_at: string;
  patient_name: string | null; patient_mobile: string | null;
  patient_age: number | null; patient_gender: string | null;
  bill_total_amount: number | null; paid_amount: number | null; due_amount: number | null;
  payment_mode: string | null; payment_status: string | null;
};
type Item = { id: string; test_name: string; status: string; reported_at: string | null };
type ReportRow = {
  id: string; order_item_id: string | null; test_name: string | null;
  signing_doctor: string | null; reported_at: string | null; created_at: string;
  is_amended: boolean; report_url: string | null; pdf_blob_ref: string | null;
  structured_values: Analyte[] | null;
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}
const money = (v: number | null | undefined) => (v == null ? "—" : `₹${new Intl.NumberFormat("en-IN").format(v)}`);

export function CorporateOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: o }, { data: its }, { data: reps }] = await Promise.all([
        supabaseClient.from("orders")
          .select("id, order_number, centre_id, created_at, patient_name, patient_mobile, patient_age, patient_gender, bill_total_amount, paid_amount, due_amount, payment_mode, payment_status")
          .eq("id", id).maybeSingle(),
        supabaseClient.from("order_items").select("id, test_name, status, reported_at")
          .eq("order_id", id).order("created_at"),
        supabaseClient.from("reports")
          .select("id, order_item_id, test_name, signing_doctor, reported_at, created_at, is_amended, report_url, pdf_blob_ref, structured_values")
          .eq("order_id", id).order("created_at", { ascending: false }),
      ]);
      setOrder((o as Order) ?? null);
      setItems((its as Item[]) ?? []);
      setReports((reps as ReportRow[]) ?? []);
      setLoading(false);
    })();
  }, [id]);

  async function openPdf(r: ReportRow) {
    setOpening(r.id);
    try { window.open(await getCorporatePdfUrl(r.id), "_blank"); }
    catch (err) { message.error((err as Error)?.message ?? "Could not open report"); }
    finally { setOpening(null); }
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin size="large" /></div>;
  if (!order) return <Empty description="Order not found" style={{ marginTop: 64 }} />;

  // Latest report per item (append-only rows, newest first).
  const seen = new Set<string>();
  const latestReports = reports.filter((r) => {
    const k = r.order_item_id ?? r.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/corporate/orders")} />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Order <code>{order.order_number}</code>
        </Typography.Title>
      </Space>

      <Card title="Patient" style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
          <Descriptions.Item label="Name">{order.patient_name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Mobile">{order.patient_mobile ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Age / Gender">{order.patient_age ?? "—"} / {order.patient_gender ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Centre">{CENTRE[order.centre_id] ?? order.centre_id}</Descriptions.Item>
          <Descriptions.Item label="Booked">{fmtDate(order.created_at)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {(order.bill_total_amount != null || order.payment_mode) && (
        <Card title="Billing" style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, sm: 2, md: 4 }} size="small" bordered>
            <Descriptions.Item label="Total">{money(order.bill_total_amount)}</Descriptions.Item>
            <Descriptions.Item label="Paid">{money(order.paid_amount)}</Descriptions.Item>
            <Descriptions.Item label="Due">
              <span style={{ color: order.due_amount ? "#cf1322" : undefined }}>{money(order.due_amount)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Mode">{order.payment_mode ?? "—"}</Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      <Card title={`Tests (${items.length})`} style={{ marginBottom: 16 }} styles={{ body: { padding: 0 } }}>
        <Table<Item> dataSource={items} rowKey="id" size="small" pagination={false} scroll={{ x: "max-content" }}>
          <Table.Column<Item> title="Test / Scan" dataIndex="test_name" />
          <Table.Column<Item> title="Status" width={150}
            render={(_, r) => <Tag color={STATUS_COLOR[r.status] ?? "default"}>{r.status.replace(/_/g, " ")}</Tag>} />
          <Table.Column<Item> title="Reported" width={160} render={(_, r) => fmtDate(r.reported_at)} />
        </Table>
      </Card>

      {latestReports.length > 0 && (
        <Card title="Reports" styles={{ body: { padding: 16 } }}>
          {latestReports.map((r) => (
            <div key={r.id} style={{ marginBottom: 20 }}>
              <Space style={{ marginBottom: 8 }} wrap>
                <Typography.Text strong>{r.test_name ?? "Report"}</Typography.Text>
                {r.is_amended && <Tag color="orange">amended</Tag>}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {fmtDate(r.reported_at ?? r.created_at)}{r.signing_doctor ? ` · ${r.signing_doctor}` : ""}
                </Typography.Text>
                {(r.pdf_blob_ref || r.report_url) && (
                  <Button size="small" type="primary" icon={<FilePdfOutlined />}
                    loading={opening === r.id} onClick={() => openPdf(r)}>PDF</Button>
                )}
              </Space>
              {Array.isArray(r.structured_values) && r.structured_values.length > 0 && (
                <AnalyteTable values={r.structured_values} />
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
