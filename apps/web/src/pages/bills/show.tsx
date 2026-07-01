import { useShow, useList, useInvalidate } from "@refinedev/core";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card, Descriptions, Table, Tag, Button, Space, Typography,
  Upload, message, Timeline, Tooltip, Popconfirm, Modal, Form, InputNumber, Select,
} from "antd";
import {
  ArrowLeftOutlined, LinkOutlined, UploadOutlined, CheckCircleOutlined, ReloadOutlined,
  StopOutlined, CheckOutlined, PlusOutlined, DollarOutlined,
} from "@ant-design/icons";
import { useEffect, useState } from "react";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { supabaseClient } from "../../lib/supabase";
import { syncBill, billAction } from "../../lib/api";
import { AnalyteTable, analyteRows, type Analyte } from "../../components/AnalyteTable";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue",
  collected: "orange",
  accessioned: "gold",
  report_generated: "cyan",
  report_sent: "green",
  cancelled: "red",
  rejected: "red",
};

const EVENT_COLOR: Record<string, string> = {
  bill_generated: "blue",
  sample_collected: "orange",
  sample_accessioned: "gold",
  report_submitted: "cyan",
  report_sent: "green",
  bill_cancelled: "red",
  item_rejected: "red",
};

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

type OrderItem = {
  id: string;
  test_name: string;
  unified_code: string | null;
  status: string;
  report_url: string | null;
  collected_at: string | null;
  accessioned_at: string | null;
  reported_at: string | null;
  is_amended: boolean;
};

type OrderEvent = {
  id: string;
  event_type: string;
  source: string;
  created_at: string;
};

type ReportRow = {
  id: string;
  order_item_id: string | null;
  test_name: string | null;
  signing_doctor: string | null;
  reported_at: string | null;
  is_amended: boolean;
  structured_values: Analyte[] | null;
};

type Order = {
  id: string;
  order_number: string;
  centre_id: string;
  channel: string;
  patient_name: string | null;
  patient_mobile: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  crelio_bill_id: string | null;
  crelio_patient_id: string | null;
  created_at: string;
  centres: { display_name: string } | null;
};

export function BillShow() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const invalidate = useInvalidate();

  const { queryResult } = useShow<Order>({
    resource: "orders",
    id,
    meta: { select: "*, centres(display_name)" },
  });
  const order = queryResult.data?.data;

  const { data: itemsData, isLoading: itemsLoading } = useList<OrderItem>({
    resource: "order_items",
    filters: id ? [{ field: "order_id", operator: "eq", value: id }] : [],
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: { pageSize: 100 },
    queryOptions: { enabled: !!id },
  });

  const { data: eventsData } = useList<OrderEvent>({
    resource: "order_events",
    filters: id ? [{ field: "order_id", operator: "eq", value: id }] : [],
    sorters: [{ field: "created_at", order: "asc" }],
    pagination: { pageSize: 200 },
    queryOptions: { enabled: !!id },
  });

  const { data: reportsData } = useList<ReportRow>({
    resource: "reports",
    filters: id ? [{ field: "order_id", operator: "eq", value: id }] : [],
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 100 },
    queryOptions: { enabled: !!id },
  });

  const items = itemsData?.data ?? [];
  const events = eventsData?.data ?? [];
  // Latest report per test (rows are append-only, newest first).
  const latestReports = (() => {
    const seen = new Set<string>();
    return (reportsData?.data ?? []).filter((r) => {
      const k = r.order_item_id ?? r.id;
      if (seen.has(k)) return false;
      seen.add(k);
      return Array.isArray(r.structured_values) && r.structured_values.length > 0;
    });
  })();

  const [refreshing, setRefreshing] = useState(false);

  // Pull this bill's latest status from Crelio (getOrderStatusAPI), then re-read.
  async function refreshFromCrelio() {
    if (!order?.crelio_bill_id || !order?.centre_id) {
      message.warning("This bill has no Crelio bill ID yet — nothing to refresh.");
      return;
    }
    setRefreshing(true);
    try {
      const res = await syncBill(order.crelio_bill_id, order.centre_id);
      message.success(`Refreshed ${res.tests} test(s) from Crelio`);
      invalidate({ resource: "order_items", invalidates: ["list"] });
      invalidate({ resource: "orders", invalidates: ["detail"] });
    } catch (err: any) {
      message.error(err?.message ?? "Crelio refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  const [acting, setActing] = useState(false);
  async function runBillAction(op: "cancel" | "complete", okMsg: string) {
    if (!order?.crelio_bill_id || !order?.centre_id) {
      message.warning("This bill has no Crelio bill ID.");
      return;
    }
    setActing(true);
    try {
      await billAction(op, { centre: order.centre_id, billId: order.crelio_bill_id });
      message.success(okMsg);
      invalidate({ resource: "order_items", invalidates: ["list"] });
      invalidate({ resource: "orders", invalidates: ["detail"] });
    } catch (err: any) {
      message.error(err?.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  }

  // ── Add Test / Payment modals ─────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testOpts, setTestOpts] = useState<{ value: string; label: string }[]>([]);
  const [addForm] = Form.useForm();
  const [payForm] = Form.useForm();

  // Load this centre's catalogue for the Add Test picker
  useEffect(() => {
    if (!addOpen || !order?.centre_id) return;
    supabaseClient
      .from("catalogue_tests")
      .select("crelio_test_id, test_name")
      .eq("centre_id", order.centre_id)
      .order("test_name")
      .limit(5000)
      .then(({ data }) =>
        setTestOpts((data ?? []).map((t) => ({ value: t.crelio_test_id as string, label: t.test_name as string }))),
      );
  }, [addOpen, order?.centre_id]);

  async function submitAddTest() {
    const v = await addForm.validateFields();
    const labelOf = new Map(testOpts.map((o) => [o.value, o.label]));
    setBusy(true);
    try {
      await billAction("add-test", {
        centre: order!.centre_id,
        billId: order!.crelio_bill_id,
        tests: (v.tests as string[]).map((id) => ({ crelioTestId: id, testName: labelOf.get(id) ?? id })),
      });
      message.success("Test(s) added");
      setAddOpen(false); addForm.resetFields();
      invalidate({ resource: "order_items", invalidates: ["list"] });
    } catch (err: any) {
      message.error(err?.message ?? "Add test failed");
    } finally { setBusy(false); }
  }

  async function submitPayment() {
    const v = await payForm.validateFields();
    setBusy(true);
    try {
      await billAction("payment", {
        centre: order!.centre_id,
        billId: order!.crelio_bill_id,
        payments: [{ paymentMode: v.paymentMode, amount: Number(v.amount) }],
      });
      message.success("Payment recorded");
      setPayOpen(false); payForm.resetFields();
    } catch (err: any) {
      message.error(err?.message ?? "Payment failed");
    } finally { setBusy(false); }
  }

  async function handleUpload(options: UploadRequestOption, itemId: string) {
    const file = options.file as File;
    const path = `${id}/${itemId}/${file.name}`;

    const { error: uploadErr } = await supabaseClient.storage
      .from("reports")
      .upload(path, file, { upsert: true });

    if (uploadErr) {
      message.error(`Upload failed: ${uploadErr.message}`);
      options.onError?.(new Error(uploadErr.message));
      return;
    }

    // Store the bucket PATH (not a public URL) — the bucket is private; we sign
    // on view.
    const { error: updateErr } = await supabaseClient
      .from("order_items")
      .update({ report_url: path })
      .eq("id", itemId);

    if (updateErr) {
      message.error(`Failed to save report: ${updateErr.message}`);
      options.onError?.(new Error(updateErr.message));
      return;
    }

    message.success("Report uploaded");
    options.onSuccess?.(path);
    invalidate({ resource: "order_items", invalidates: ["list"] });
  }

  // Open a report: external URLs open directly; bucket paths (and legacy public
  // bucket URLs) get a short-lived signed URL since the bucket is now private.
  async function openReport(ref: string) {
    const legacy = ref.match(/\/storage\/v1\/object\/public\/reports\/(.+)$/);
    const path = legacy ? decodeURIComponent(legacy[1]) : (/^https?:\/\//.test(ref) ? null : ref);
    if (path === null) { window.open(ref, "_blank"); return; }
    const { data, error } = await supabaseClient.storage.from("reports").createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else message.error(error?.message ?? "Could not open report");
  }

  const patientMobile = order?.patient_mobile;

  return (
    <div style={{ padding: "0 24px 40px" }}>
      {/* Header */}
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/bills")} />
        <Typography.Title level={4} style={{ margin: 0 }}>
          Bill <code>{order?.order_number ?? "…"}</code>
        </Typography.Title>
        {order?.crelio_bill_id && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Crelio #{order.crelio_bill_id}
          </Typography.Text>
        )}
        {order?.crelio_bill_id && (
          <>
            <Button size="small" icon={<ReloadOutlined />} loading={refreshing} onClick={refreshFromCrelio}>
              Refresh from Crelio
            </Button>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add Test</Button>
            <Button size="small" icon={<DollarOutlined />} onClick={() => setPayOpen(true)}>Payment</Button>
            <Popconfirm title="Mark this bill complete in Crelio?" onConfirm={() => runBillAction("complete", "Bill marked complete")}>
              <Button size="small" icon={<CheckOutlined />} loading={acting}>Complete</Button>
            </Popconfirm>
            <Popconfirm title="Cancel this entire bill in Crelio?" okText="Cancel bill" okButtonProps={{ danger: true }} onConfirm={() => runBillAction("cancel", "Bill cancelled")}>
              <Button size="small" danger icon={<StopOutlined />} loading={acting}>Cancel Bill</Button>
            </Popconfirm>
          </>
        )}
      </Space>

      {/* Patient + Order Info */}
      <Card
        title="Patient"
        extra={
          patientMobile && (
            <Link to={`/patients/${patientMobile}`}>
              <Button size="small">All bills for this patient →</Button>
            </Link>
          )
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
          <Descriptions.Item label="Name">{order?.patient_name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Mobile">
            {patientMobile ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Age / Gender">
            {order?.patient_age ?? "—"} / {order?.patient_gender ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Centre">
            {order?.centres?.display_name ?? order?.centre_id ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Channel">
            <Tag color={order?.channel === "corporate" ? "purple" : order?.channel === "d2c" ? "blue" : "default"}>
              {order?.channel}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Date">{fmtDate(order?.created_at)}</Descriptions.Item>
          <Descriptions.Item label="Crelio Bill ID">{order?.crelio_bill_id ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Crelio Patient ID">{order?.crelio_patient_id ?? "—"}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Tests / Scans */}
      <Card title={`Tests & Scans (${items.length})`} style={{ marginBottom: 16 }}>
        <Table<OrderItem>
          dataSource={items}
          rowKey="id"
          size="small"
          loading={itemsLoading}
          pagination={false}
        >
          <Table.Column<OrderItem>
            dataIndex="test_name"
            title="Test / Scan"
            render={(v, row) => (
              <Space direction="vertical" size={0}>
                <span>{v}</span>
                {row.unified_code && (
                  <span style={{ color: "#aaa", fontSize: 11 }}>{row.unified_code}</span>
                )}
              </Space>
            )}
          />
          <Table.Column<OrderItem>
            dataIndex="status"
            title="Status"
            width={155}
            render={(v: string) => (
              <Tag color={STATUS_COLOR[v] ?? "default"}>{v?.replace(/_/g, " ")}</Tag>
            )}
          />
          <Table.Column<OrderItem>
            dataIndex="collected_at"
            title="Collected"
            width={155}
            render={(v) => fmtDate(v)}
          />
          <Table.Column<OrderItem>
            dataIndex="reported_at"
            title="Reported"
            width={155}
            render={(v) => fmtDate(v)}
          />
          <Table.Column<OrderItem>
            title="Report"
            width={160}
            render={(_, row) => {
              if (row.report_url) {
                return (
                  <Space>
                    <Tooltip title={row.is_amended ? "Amended report" : undefined}>
                      <Button
                        size="small"
                        type="primary"
                        icon={<LinkOutlined />}
                        onClick={() => row.report_url && openReport(row.report_url)}
                      >
                        {row.is_amended ? "View (amended)" : "View Report"}
                      </Button>
                    </Tooltip>
                    <Upload
                      showUploadList={false}
                      accept=".pdf,.jpg,.jpeg,.png"
                      customRequest={(opts) => handleUpload(opts, row.id)}
                    >
                      <Tooltip title="Replace report">
                        <Button size="small" icon={<UploadOutlined />} />
                      </Tooltip>
                    </Upload>
                  </Space>
                );
              }
              if (["report_sent", "report_generated"].includes(row.status)) {
                return (
                  <Space>
                    <CheckCircleOutlined style={{ color: "#52c41a" }} />
                    <Upload
                      showUploadList={false}
                      accept=".pdf,.jpg,.jpeg,.png"
                      customRequest={(opts) => handleUpload(opts, row.id)}
                    >
                      <Button size="small" icon={<UploadOutlined />}>Upload</Button>
                    </Upload>
                  </Space>
                );
              }
              return (
                <Upload
                  showUploadList={false}
                  accept=".pdf,.jpg,.jpeg,.png"
                  customRequest={(opts) => handleUpload(opts, row.id)}
                >
                  <Button size="small" icon={<UploadOutlined />}>Upload Report</Button>
                </Upload>
              );
            }}
          />
        </Table>
      </Card>

      {/* Structured Results (from the canonical report store) */}
      {latestReports.length > 0 && (
        <Card title="Results" style={{ marginBottom: 16 }}>
          {latestReports.map((r) => {
            const rows = analyteRows(r.structured_values ?? []);
            if (!rows.length) return null;
            return (
              <div key={r.id} style={{ marginBottom: 16 }}>
                <Space style={{ marginBottom: 8 }}>
                  <Typography.Text strong>{r.test_name ?? "Report"}</Typography.Text>
                  {r.is_amended && <Tag color="orange">amended</Tag>}
                  {r.signing_doctor && <Typography.Text type="secondary" style={{ fontSize: 12 }}>· {r.signing_doctor}</Typography.Text>}
                </Space>
                <AnalyteTable values={r.structured_values ?? []} />
              </div>
            );
          })}
        </Card>
      )}

      {/* Event Log */}
      {events.length > 0 && (
        <Card title="Event Log" size="small">
          <Timeline
            style={{ padding: "16px 0 0" }}
            items={events.map((e) => ({
              color: EVENT_COLOR[e.event_type] ?? "gray",
              children: (
                <Space direction="vertical" size={0}>
                  <span style={{ textTransform: "capitalize" }}>
                    {e.event_type.replace(/_/g, " ")}
                  </span>
                  <span style={{ color: "#888", fontSize: 11 }}>
                    {fmtDate(e.created_at)} · {e.source}
                  </span>
                </Space>
              ),
            }))}
          />
        </Card>
      )}

      {/* Add Test modal */}
      <Modal
        title="Add test to bill"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={submitAddTest}
        okText="Add to Crelio bill"
        confirmLoading={busy}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item name="tests" label="Tests / profiles" rules={[{ required: true, message: "Pick at least one" }]}>
            <Select
              mode="multiple"
              showSearch
              placeholder="Search the catalogue…"
              options={testOpts}
              optionFilterProp="label"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Payment modal */}
      <Modal
        title="Record payment"
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        onOk={submitPayment}
        okText="Record in Crelio"
        confirmLoading={busy}
      >
        <Form form={payForm} layout="vertical" initialValues={{ paymentMode: "Cash" }}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber style={{ width: "100%" }} min={1} prefix="₹" />
          </Form.Item>
          <Form.Item name="paymentMode" label="Mode">
            <Select options={[
              { value: "Cash", label: "Cash" },
              { value: "Online", label: "Online" },
              { value: "Card", label: "Card" },
              { value: "UPI", label: "UPI" },
            ]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
