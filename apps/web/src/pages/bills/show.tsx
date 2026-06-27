import { useShow, useList, useInvalidate } from "@refinedev/core";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Card, Descriptions, Table, Tag, Button, Space, Typography,
  Upload, message, Timeline, Tooltip, Popconfirm,
} from "antd";
import {
  ArrowLeftOutlined, LinkOutlined, UploadOutlined, CheckCircleOutlined, ReloadOutlined,
  StopOutlined, CheckOutlined,
} from "@ant-design/icons";
import { useState } from "react";
import type { UploadRequestOption } from "rc-upload/lib/interface";
import { supabaseClient } from "../../lib/supabase";
import { syncBill, billAction } from "../../lib/api";

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

  const items = itemsData?.data ?? [];
  const events = eventsData?.data ?? [];

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

    const { data: { publicUrl } } = supabaseClient.storage
      .from("reports")
      .getPublicUrl(path);

    const { error: updateErr } = await supabaseClient
      .from("order_items")
      .update({ report_url: publicUrl })
      .eq("id", itemId);

    if (updateErr) {
      message.error(`Failed to save URL: ${updateErr.message}`);
      options.onError?.(new Error(updateErr.message));
      return;
    }

    message.success("Report uploaded");
    options.onSuccess?.(publicUrl);
    invalidate({ resource: "order_items", invalidates: ["list"] });
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
                        href={row.report_url}
                        target="_blank"
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
    </div>
  );
}
