import { useTable, List } from "@refinedev/antd";
import { Tag, Select, Row, Col, Space, Button, Upload, message, Tooltip } from "antd";
import type { ColumnsType } from "antd/es/table";
import { UploadOutlined, LinkOutlined, CheckOutlined, SendOutlined, AudioOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { DateFilter, type DateRange } from "../../components/DateFilter";
import { GroupBySelect, GroupedTable, dayKey, type GroupByOption } from "../../components/GroupedList";
import { supabaseClient } from "../../lib/supabase";
import { sendReportToPatient, openReporter } from "../../lib/api";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};

// Worklist-relevant status buckets: what still needs a technician's attention.
const PENDING = ["booked", "collected", "accessioned", "report_generated"];

const CENTRE: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};
const CENTRE_OPTS = Object.entries(CENTRE).map(([value, label]) => ({ value, label }));

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

type WLRow = {
  id: string; order_id: string; crelio_test_id: string | null; test_name: string;
  status: string; report_url: string | null; department: string | null;
  centre_id: string; order_number: string; patient_name: string | null;
  patient_mobile: string | null; created_at: string;
};

const GROUPS: GroupByOption<WLRow>[] = [
  { value: "status", label: "Status", getKey: (r) => r.status.replace(/_/g, " ") },
  { value: "centre", label: "Centre", getKey: (r) => CENTRE[r.centre_id] ?? r.centre_id },
  { value: "date", label: "Date", getKey: (r) => dayKey(r.created_at) },
];

export function Worklist({ modality, title }: { modality: "us" | "ctmri" | "xray"; title: string }) {
  const navigate = useNavigate();
  const { tableProps, setFilters, tableQueryResult } = useTable<WLRow>({
    resource: "order_items_view",
    filters: {
      permanent: [
        { field: "service_line", operator: "eq", value: "radiology" },
        { field: "modality", operator: "eq", value: modality },
      ],
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  const [status, setStatus] = useState("pending");
  const [centre, setCentre] = useState<string>();
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const f: CrudFilters = [];
    if (status === "pending") f.push({ field: "status", operator: "in", value: PENDING });
    else if (status !== "all") f.push({ field: "status", operator: "eq", value: status });
    if (centre) f.push({ field: "centre_id", operator: "eq", value: centre });
    if (date) {
      f.push({ field: "created_at", operator: "gte", value: date.start });
      f.push({ field: "created_at", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [status, centre, date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upload a report → store bucket path on the item + insert a reports row so it
  // surfaces in the patient portal.
  async function handleUpload(options: UploadRequestOption, row: WLRow) {
    const file = options.file as File;
    const path = `${row.order_id}/${row.id}/${file.name}`;
    const { error: upErr } = await supabaseClient.storage.from("reports").upload(path, file, { upsert: true });
    if (upErr) { message.error(`Upload failed: ${upErr.message}`); options.onError?.(new Error(upErr.message)); return; }

    const { error: itemErr } = await supabaseClient.from("order_items").update({ report_url: path }).eq("id", row.id);
    if (itemErr) { message.error(itemErr.message); options.onError?.(new Error(itemErr.message)); return; }

    // Report row for the patient portal (PDF only — no structured values).
    await supabaseClient.from("reports").insert({
      order_id: row.order_id, order_item_id: row.id, crelio_test_id: row.crelio_test_id,
      test_name: row.test_name, report_url: path, pdf_blob_ref: path,
      source: "ris", reported_at: new Date().toISOString(),
    });

    message.success("Report uploaded");
    options.onSuccess?.(path);
    tableQueryResult.refetch();
  }

  async function markCompleted(row: WLRow) {
    setBusy(row.id);
    const { error } = await supabaseClient.from("order_items").update({ status: "completed" }).eq("id", row.id);
    setBusy(null);
    if (error) { message.error(error.message.includes("no report") ? "Upload a report first" : error.message); return; }
    message.success("Marked completed");
    tableQueryResult.refetch();
  }

  async function sendToPatient(row: WLRow) {
    setBusy(row.id);
    try {
      await sendReportToPatient(row.id);
      message.success("Report sent to patient");
      tableQueryResult.refetch();
    } catch (err: any) {
      message.error(err?.message ?? "Send failed");
    } finally { setBusy(null); }
  }

  // Hand the scan off to the external radiology reporting tool (new tab). On
  // completion the tool pushes the report back → the item flips to completed.
  async function openReporterFor(row: WLRow) {
    setBusy(row.id);
    try {
      const { url } = await openReporter(row.id);
      window.open(url, "_blank");
    } catch (err: any) {
      message.error(err?.message ?? "Could not open reporter");
    } finally { setBusy(null); }
  }

  async function openReport(ref: string) {
    const path = /^https?:\/\//.test(ref) ? null : ref;
    if (path === null) { window.open(ref, "_blank"); return; }
    const { data, error } = await supabaseClient.storage.from("reports").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else message.error(error?.message ?? "Could not open report");
  }

  const columns: ColumnsType<WLRow> = [
    {
      title: "Scan",
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.test_name}</span>
          {r.department && <span style={{ color: "#aaa", fontSize: 11 }}>{r.department}</span>}
        </Space>
      ),
    },
    {
      dataIndex: "status", title: "Status", width: 130,
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? "default"}>{v?.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Patient", width: 170,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.patient_name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
          {r.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{r.patient_mobile}</span>}
        </Space>
      ),
    },
    { title: "Centre", width: 130, render: (_, r) => CENTRE[r.centre_id] ?? r.centre_id },
    { dataIndex: "created_at", title: "Booked", width: 130, render: (v) => fmtDate(v) },
    {
      title: "Bill", width: 120,
      render: (_, r) => (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => navigate(`/bills/${r.order_id}`)}>
          <code style={{ fontSize: 11 }}>{r.order_number}</code>
        </Button>
      ),
    },
    {
      title: "Report", width: 300,
      render: (_, r) => {
        const terminal = ["cancelled", "rejected"].includes(r.status);
        if (terminal) return <Tag color="red">{r.status}</Tag>;
        const canReport = modality === "ctmri" && !["completed", "report_sent"].includes(r.status);
        return (
          <Space wrap>
            {canReport && (
              <Tooltip title="Dictate the report in the radiology scribe tool">
                <Button size="small" type="primary" ghost icon={<AudioOutlined />}
                  loading={busy === r.id} onClick={() => openReporterFor(r)}>Reporter</Button>
              </Tooltip>
            )}
            <Upload showUploadList={false} accept=".pdf,.jpg,.jpeg,.png" customRequest={(o) => handleUpload(o, r)}>
              <Button size="small" icon={<UploadOutlined />}>{r.report_url ? "Replace" : "Upload"}</Button>
            </Upload>
            {r.report_url && (
              <Tooltip title="View report">
                <Button size="small" icon={<LinkOutlined />} onClick={() => openReport(r.report_url!)} />
              </Tooltip>
            )}
            {r.report_url && r.status !== "completed" && r.status !== "report_sent" && (
              <Button size="small" type="primary" icon={<CheckOutlined />}
                loading={busy === r.id} onClick={() => markCompleted(r)}>Complete</Button>
            )}
            {r.status === "completed" && (
              <Button size="small" icon={<SendOutlined />} loading={busy === r.id}
                onClick={() => sendToPatient(r)}>Send</Button>
            )}
            {r.status === "report_sent" && <Tag color="green">sent</Tag>}
          </Space>
        );
      },
    },
  ];

  return (
    <List title={`${title} — Worklist`}>
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Select value={status} style={{ width: 220 }} onChange={setStatus}
            options={[
              { value: "pending", label: "Pending (needs report)" },
              { value: "completed", label: "Completed (ready to send)" },
              { value: "report_sent", label: "Sent to patient" },
              { value: "all", label: "All statuses" },
            ]} />
        </Col>
        <Col><Select placeholder="Centre" allowClear style={{ width: 150 }} value={centre} onChange={setCentre} options={CENTRE_OPTS} /></Col>
        <Col><DateFilter onChange={setDate} /></Col>
        <Col><GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} /></Col>
      </Row>

      <GroupedTable<WLRow>
        tableProps={tableProps}
        columns={columns}
        rowKey="id"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        totalLabel="scans"
      />
    </List>
  );
}
