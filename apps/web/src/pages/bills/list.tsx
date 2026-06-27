import { useTable, List } from "@refinedev/antd";
import { Table, Tag, Input, Select, Row, Col, Space, Button } from "antd";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";

const CENTRES = [
  { value: "KYL", label: "Kalyan Nagar" },
  { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" },
  { value: "BSK", label: "Banashankari" },
];

const STATUSES = [
  { value: "booked", label: "Booked" },
  { value: "collected", label: "Collected" },
  { value: "accessioned", label: "Accessioned" },
  { value: "report_generated", label: "Report Ready" },
  { value: "report_sent", label: "Report Sent" },
  { value: "cancelled", label: "Cancelled" },
];

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

function fmtDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

export function BillList() {
  const navigate = useNavigate();
  const { tableProps, setFilters } = useTable({
    resource: "orders",
    meta: { select: "*, centres(display_name), order_items(id, status)" },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  function handleSearch(val: string) {
    if (!val) { setFilters([]); return; }
    const f: CrudFilters = [{
      operator: "or",
      value: [
        { field: "patient_name", operator: "contains", value: val },
        { field: "patient_mobile", operator: "contains", value: val },
        { field: "order_number", operator: "contains", value: val },
      ],
    }];
    setFilters(f);
  }

  return (
    <List
      title="Bills"
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/bills/new")}>
          New Booking
        </Button>
      }
    >
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col>
          <Input.Search
            placeholder="Name / mobile / order #"
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
            onSearch={handleSearch}
            allowClear
            onClear={() => setFilters([])}
          />
        </Col>
        <Col>
          <Select placeholder="Centre" style={{ width: 160 }} allowClear options={CENTRES}
            onChange={(v) => setFilters(v ? [{ field: "centre_id", operator: "eq", value: v }] : [])} />
        </Col>
        <Col>
          <Select placeholder="Channel" style={{ width: 130 }} allowClear
            options={[{ value: "corporate", label: "Corporate" }, { value: "d2c", label: "D2C" }, { value: "walkin", label: "Walk-in" }]}
            onChange={(v) => setFilters(v ? [{ field: "channel", operator: "eq", value: v }] : [])} />
        </Col>
        <Col>
          <Select placeholder="Status" style={{ width: 160 }} allowClear options={STATUSES}
            onChange={(v) => {
              if (!v) { setFilters([]); return; }
              // filter order_items by status — simulated via order-level search
              setFilters([{ field: "order_items.status", operator: "eq", value: v }]);
            }} />
        </Col>
      </Row>

      <Table
        {...tableProps}
        rowKey="id"
        size="small"
        onRow={(row) => ({ onClick: () => navigate(`/bills/${row.id}`) })}
        style={{ cursor: "pointer" }}
        pagination={{ ...tableProps.pagination, showSizeChanger: true, showTotal: (t) => `${t} bills` }}
      >
        <Table.Column
          dataIndex="order_number"
          title="Order #"
          width={150}
          render={(v) => <code style={{ fontSize: 12 }}>{v}</code>}
        />
        <Table.Column
          dataIndex="patient_name"
          title="Patient"
          width={180}
          render={(name: string | null, row: Record<string, unknown>) => (
            <Space direction="vertical" size={0}>
              <span>{name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
              {typeof row.patient_mobile === "string" && (
                <span style={{ color: "#888", fontSize: 11 }}>{row.patient_mobile}</span>
              )}
            </Space>
          )}
        />
        <Table.Column
          dataIndex="centres"
          title="Centre"
          width={140}
          render={(c: { display_name: string } | null) => c?.display_name ?? "—"}
        />
        <Table.Column
          dataIndex="channel"
          title="Channel"
          width={110}
          render={(v: string) => (
            <Tag color={v === "corporate" ? "purple" : v === "d2c" ? "blue" : "default"}>{v}</Tag>
          )}
        />
        <Table.Column
          dataIndex="order_items"
          title="Status"
          width={155}
          render={(items: { status: string }[]) => {
            const s = aggStatus(items ?? []);
            return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
          }}
        />
        <Table.Column
          dataIndex="order_items"
          title="Tests"
          width={60}
          align="center"
          render={(items: unknown[]) => items?.length ?? 0}
        />
        <Table.Column
          dataIndex="created_at"
          title="Date"
          width={160}
          render={(v: string) => fmtDate(v)}
          sorter
        />
      </Table>
    </List>
  );
}
