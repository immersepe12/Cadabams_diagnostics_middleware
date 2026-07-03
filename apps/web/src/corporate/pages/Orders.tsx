import { useTable } from "@refinedev/antd";
import { Tag, Input, Space, Typography, Row, Col } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "../../components/DateFilter";
import { GroupBySelect, GroupedTable, dayKey, type GroupByOption } from "../../components/GroupedList";

// Corporate orders list — RLS scopes rows to the corporate's orgs; this page is
// the bills list minus ops-only bits, with the same search/date/group-by tools.

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};
const STATUS_ORDER = ["booked", "collected", "accessioned", "report_generated", "completed", "report_sent"];
const CENTRE: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};

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
const money = (v: number | null | undefined) => (v == null ? "—" : `₹${new Intl.NumberFormat("en-IN").format(v)}`);

type Row2 = {
  id: string; order_number: string; patient_name: string | null; patient_mobile: string | null;
  centre_id: string; created_at: string;
  bill_total_amount: number | null; due_amount: number | null;
  order_items: { status: string }[];
};

const columns: ColumnsType<Row2> = [
  { dataIndex: "order_number", title: "Order #", width: 150, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
  {
    dataIndex: "patient_name", title: "Patient", width: 180,
    render: (name: string | null, row) => (
      <Space direction="vertical" size={0}>
        <span>{name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
        {row.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{row.patient_mobile}</span>}
      </Space>
    ),
  },
  { title: "Centre", width: 140, render: (_, r) => CENTRE[r.centre_id] ?? r.centre_id },
  {
    dataIndex: "order_items", title: "Status", width: 150,
    render: (items: { status: string }[]) => {
      const s = aggStatus(items ?? []);
      return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
    },
  },
  { dataIndex: "order_items", key: "tests", title: "Tests", width: 60, align: "center", render: (items: unknown[]) => items?.length ?? 0 },
  {
    title: "Bill", width: 130,
    render: (_, r) => (
      <Space direction="vertical" size={0}>
        <span>{money(r.bill_total_amount)}</span>
        {!!r.due_amount && <span style={{ color: "#cf1322", fontSize: 11 }}>due {money(r.due_amount)}</span>}
      </Space>
    ),
  },
  { dataIndex: "created_at", title: "Date", width: 160, render: (v: string) => fmtDate(v), sorter: true },
];

const GROUPS: GroupByOption<Row2>[] = [
  { value: "centre", label: "Centre", getKey: (r) => CENTRE[r.centre_id] ?? r.centre_id },
  { value: "status", label: "Status", getKey: (r) => aggStatus(r.order_items ?? []).replace(/_/g, " ") },
  { value: "date", label: "Date", getKey: (r) => dayKey(r.created_at) },
];

export function CorporateOrders() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  const { tableProps, setFilters } = useTable<Row2>({
    resource: "orders",
    meta: { select: "id, order_number, patient_name, patient_mobile, centre_id, created_at, bill_total_amount, due_amount, order_items(status)" },
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
    if (date) {
      f.push({ field: "created_at", operator: "gte", value: date.start });
      f.push({ field: "created_at", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [q, date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Typography.Title level={4} style={{ margin: "0 0 12px" }}>Orders</Typography.Title>
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Input.Search placeholder="Name / mobile / order #" style={{ width: 240 }}
            prefix={<SearchOutlined />} onSearch={setQ} allowClear
            onChange={(e) => { if (!e.target.value) setQ(""); }} />
        </Col>
        <Col><DateFilter onChange={setDate} /></Col>
        <Col><GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} /></Col>
      </Row>

      <GroupedTable<Row2>
        tableProps={tableProps}
        columns={columns}
        rowKey="id"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        onRow={(row) => ({ onClick: () => navigate(`/corporate/orders/${row.id}`) })}
        totalLabel="orders"
      />
    </div>
  );
}
