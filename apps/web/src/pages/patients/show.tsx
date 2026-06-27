import { useList } from "@refinedev/core";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Table, Tag, Button, Space, Typography, Descriptions } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue",
  collected: "orange",
  accessioned: "gold",
  report_generated: "cyan",
  report_sent: "green",
  cancelled: "red",
  rejected: "red",
};

const STATUS_ORDER = ["booked", "collected", "accessioned", "report_generated", "report_sent"];

function aggStatus(items: { status: string }[]): string {
  const active = items.filter((i) => !["cancelled", "rejected"].includes(i.status));
  const pool = active.length ? active : items;
  if (!pool.length) return "booked";
  const idx = Math.min(...pool.map((i) => Math.max(0, STATUS_ORDER.indexOf(i.status))));
  return STATUS_ORDER[idx] ?? pool[0].status;
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

type Bill = {
  id: string;
  order_number: string;
  centre_id: string;
  channel: string;
  patient_name: string | null;
  patient_age: number | null;
  patient_gender: string | null;
  created_at: string;
  centres: { display_name: string } | null;
  order_items: { status: string }[];
};

export function PatientShow() {
  const { mobile } = useParams<{ mobile: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useList<Bill>({
    resource: "orders",
    filters: [{ field: "patient_mobile", operator: "eq", value: mobile ?? "" }],
    sorters: [{ field: "created_at", order: "desc" }],
    pagination: { pageSize: 200 },
    meta: { select: "*, centres(display_name), order_items(status)" },
    queryOptions: { enabled: !!mobile },
  });

  const bills = data?.data ?? [];
  const first = bills[0];

  return (
    <div style={{ padding: "0 24px 24px" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/patients")} />
        <Typography.Title level={4} style={{ margin: 0 }}>
          {first?.patient_name ?? mobile}
        </Typography.Title>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 3 }} size="small">
          <Descriptions.Item label="Mobile">{mobile}</Descriptions.Item>
          <Descriptions.Item label="Name">{first?.patient_name ?? "—"}</Descriptions.Item>
          <Descriptions.Item label="Age / Gender">
            {first?.patient_age ?? "—"} / {first?.patient_gender ?? "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Total Bills">{bills.length}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Bills">
        <Table<Bill>
          dataSource={bills}
          rowKey="id"
          loading={isLoading}
          size="small"
          onRow={(row) => ({ onClick: () => navigate(`/bills/${row.id}`) })}
          pagination={false}
        >
          <Table.Column<Bill>
            dataIndex="order_number"
            title="Order #"
            render={(v) => <code style={{ fontSize: 12 }}>{v}</code>}
          />
          <Table.Column<Bill>
            dataIndex="centres"
            title="Centre"
            render={(c: Bill["centres"]) => c?.display_name ?? "—"}
          />
          <Table.Column<Bill>
            dataIndex="channel"
            title="Channel"
            render={(v: string) => (
              <Tag color={v === "corporate" ? "purple" : v === "d2c" ? "blue" : "default"}>
                {v}
              </Tag>
            )}
          />
          <Table.Column<Bill>
            dataIndex="order_items"
            title="Status"
            render={(items: { status: string }[]) => {
              const s = aggStatus(items ?? []);
              return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
            }}
          />
          <Table.Column<Bill>
            dataIndex="order_items"
            title="Tests"
            width={70}
            align="center"
            render={(items: unknown[]) => items?.length ?? 0}
          />
          <Table.Column<Bill>
            dataIndex="created_at"
            title="Date"
            render={(v: string) => fmtDate(v)}
          />
          <Table.Column<Bill>
            width={70}
            render={(_, row) => (
              <Button size="small" onClick={(e) => { e.stopPropagation(); navigate(`/bills/${row.id}`); }}>
                Open
              </Button>
            )}
          />
        </Table>
      </Card>
    </div>
  );
}
