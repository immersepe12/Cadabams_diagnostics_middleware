import { useTable, List } from "@refinedev/antd";
import { Tag, Input, Select, Row, Col, Space, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, PlusOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "../../components/DateFilter";
import { GroupBySelect, GroupedTable, dayKey, type GroupByOption } from "../../components/GroupedList";

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
  completed: "geekblue",
  report_sent: "green",
  cancelled: "red",
  rejected: "red",
};

const STATUS_ORDER = ["booked", "collected", "accessioned", "report_generated", "completed", "report_sent"];

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

type BillRow = {
  id: string;
  order_number: string;
  patient_name: string | null;
  patient_mobile: string | null;
  channel: string;
  centre_id: string;
  created_at: string;
  centres: { display_name: string } | null;
  order_items: { id: string; status: string }[];
};

const columns: ColumnsType<BillRow> = [
  {
    dataIndex: "order_number", title: "Order #", width: 150,
    render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
  },
  {
    dataIndex: "patient_name", title: "Patient", width: 180,
    render: (name: string | null, row) => (
      <Space direction="vertical" size={0}>
        <span>{name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
        {row.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{row.patient_mobile}</span>}
      </Space>
    ),
  },
  {
    dataIndex: "centres", title: "Centre", width: 140,
    render: (c: BillRow["centres"]) => c?.display_name ?? "—",
  },
  {
    dataIndex: "channel", title: "Channel", width: 110,
    render: (v: string) => (
      <Tag color={v === "corporate" ? "purple" : v === "d2c" ? "blue" : "default"}>{v}</Tag>
    ),
  },
  {
    dataIndex: "order_items", title: "Status", width: 155,
    render: (items: { status: string }[]) => {
      const s = aggStatus(items ?? []);
      return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
    },
  },
  {
    dataIndex: "order_items", key: "tests", title: "Tests", width: 60, align: "center",
    render: (items: unknown[]) => items?.length ?? 0,
  },
  {
    dataIndex: "created_at", title: "Date", width: 160,
    render: (v: string) => fmtDate(v),
    sorter: true,
  },
];

const GROUPS: GroupByOption<BillRow>[] = [
  { value: "centre", label: "Centre", getKey: (r) => r.centres?.display_name ?? r.centre_id ?? "—" },
  { value: "channel", label: "Channel", getKey: (r) => r.channel },
  { value: "status", label: "Status", getKey: (r) => aggStatus(r.order_items ?? []).replace(/_/g, " ") },
  { value: "date", label: "Date", getKey: (r) => dayKey(r.created_at) },
];

export function BillList() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [centre, setCentre] = useState<string>();
  const [channel, setChannel] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  const { tableProps, setFilters } = useTable<BillRow>({
    resource: "orders",
    // Use an inner join only when filtering by status (so it filters the bills),
    // otherwise a plain embed so bills with no items still show.
    meta: {
      select: status
        ? "*, centres(display_name), order_items!inner(id, status)"
        : "*, centres(display_name), order_items(id, status)",
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  useEffect(() => {
    const f: CrudFilters = [];
    if (q) f.push({
      operator: "or",
      value: [
        { field: "patient_name", operator: "contains", value: q },
        { field: "patient_mobile", operator: "contains", value: q },
        { field: "order_number", operator: "contains", value: q },
      ],
    });
    if (centre) f.push({ field: "centre_id", operator: "eq", value: centre });
    if (channel) f.push({ field: "channel", operator: "eq", value: channel });
    if (status) f.push({ field: "order_items.status", operator: "eq", value: status });
    if (date) {
      f.push({ field: "created_at", operator: "gte", value: date.start });
      f.push({ field: "created_at", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [q, centre, channel, status, date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <List
      title="Bills"
      headerButtons={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/bills/new")}>
          New Booking
        </Button>
      }
    >
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Input.Search
            placeholder="Name / mobile / order #"
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
            onSearch={setQ}
            allowClear
            onChange={(e) => { if (!e.target.value) setQ(""); }}
          />
        </Col>
        <Col>
          <Select placeholder="Centre" style={{ width: 160 }} allowClear options={CENTRES} value={centre} onChange={setCentre} />
        </Col>
        <Col>
          <Select placeholder="Channel" style={{ width: 130 }} allowClear value={channel} onChange={setChannel}
            options={[{ value: "corporate", label: "Corporate" }, { value: "d2c", label: "D2C" }, { value: "walkin", label: "Walk-in" }]} />
        </Col>
        <Col>
          <Select placeholder="Status" style={{ width: 160 }} allowClear options={STATUSES} value={status} onChange={setStatus} />
        </Col>
        <Col>
          <DateFilter onChange={setDate} />
        </Col>
        <Col>
          <GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} />
        </Col>
      </Row>

      <GroupedTable<BillRow>
        tableProps={tableProps}
        columns={columns}
        rowKey="id"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        onRow={(row) => ({ onClick: () => navigate(`/bills/${row.id}`) })}
        totalLabel="bills"
      />
    </List>
  );
}
