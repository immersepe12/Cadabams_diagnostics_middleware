import { useTable, List } from "@refinedev/antd";
import { Tag, Select, Row, Col, Space, Button } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "../../components/DateFilter";
import { GroupBySelect, GroupedTable, dayKey, type GroupByOption } from "../../components/GroupedList";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};

const ACTIVE = ["booked", "collected", "accessioned", "report_generated"];
const ALL_STATUSES = [...ACTIVE, "completed", "report_sent", "cancelled", "rejected"];

const CENTRE_OPTS = [
  { value: "KYL", label: "Kalyan Nagar" }, { value: "JNR", label: "Jayanagar" },
  { value: "KKP", label: "Kanakapura" }, { value: "BSK", label: "Banashankari" },
];

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

type TestRow = {
  id: string; test_name: string; status: string; created_at: string;
  collected_at: string | null; reported_at: string | null;
  orders: {
    id: string; order_number: string; patient_name: string | null;
    patient_mobile: string | null; centres: { display_name: string } | null;
  } | null;
};

const GROUPS: GroupByOption<TestRow>[] = [
  { value: "status", label: "Status", getKey: (r) => r.status.replace(/_/g, " ") },
  { value: "centre", label: "Centre", getKey: (r) => r.orders?.centres?.display_name ?? "—" },
  { value: "date", label: "Date", getKey: (r) => dayKey(r.created_at) },
];

export function TestList() {
  const navigate = useNavigate();
  const { tableProps, setFilters } = useTable<TestRow>({
    resource: "order_items",
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: {
      select: "id, test_name, status, created_at, collected_at, reported_at, orders!inner(id, order_number, patient_name, patient_mobile, centre_id, centres(display_name))",
    },
  });

  const [status, setStatus] = useState("active");
  const [centre, setCentre] = useState<string>();
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  useEffect(() => {
    const f: CrudFilters = [];
    if (status === "active") f.push({ field: "status", operator: "in", value: ACTIVE });
    else if (status !== "all") f.push({ field: "status", operator: "eq", value: status });
    if (centre) f.push({ field: "orders.centre_id", operator: "eq", value: centre });
    if (date) {
      f.push({ field: "created_at", operator: "gte", value: date.start });
      f.push({ field: "created_at", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [status, centre, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<TestRow> = [
    { dataIndex: "test_name", title: "Test / Scan" },
    {
      dataIndex: "status", title: "Status", width: 155,
      render: (v: string) => <Tag color={STATUS_COLOR[v] ?? "default"}>{v.replace(/_/g, " ")}</Tag>,
    },
    {
      title: "Patient", width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={0}>
          <span>{row.orders?.patient_name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
          {row.orders?.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{row.orders.patient_mobile}</span>}
        </Space>
      ),
    },
    { title: "Centre", width: 140, render: (_, row) => row.orders?.centres?.display_name ?? "—" },
    { dataIndex: "collected_at", title: "Collected", width: 140, render: (v) => fmtDate(v) },
    {
      title: "Bill", width: 160,
      render: (_, row) => (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => row.orders?.id && navigate(`/bills/${row.orders.id}`)}>
          <code style={{ fontSize: 11 }}>{row.orders?.order_number}</code>
        </Button>
      ),
    },
  ];

  return (
    <List title="Ongoing Tests">
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Select value={status} style={{ width: 180 }} onChange={setStatus}
            options={[
              { value: "active", label: "Active (in pipeline)" },
              { value: "all", label: "All statuses" },
              ...ALL_STATUSES.map((s) => ({ value: s, label: <Tag color={STATUS_COLOR[s]}>{s.replace(/_/g, " ")}</Tag> })),
            ]}
          />
        </Col>
        <Col>
          <Select placeholder="Centre" allowClear style={{ width: 150 }} value={centre} onChange={setCentre} options={CENTRE_OPTS} />
        </Col>
        <Col>
          <DateFilter onChange={setDate} />
        </Col>
        <Col>
          <GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} />
        </Col>
      </Row>

      <GroupedTable<TestRow>
        tableProps={tableProps}
        columns={columns}
        rowKey="id"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        totalLabel="tests"
      />
    </List>
  );
}
