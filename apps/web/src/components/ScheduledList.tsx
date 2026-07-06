import { useTable } from "@refinedev/antd";
import { Tag, Select, Row, Col, Space, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "./DateFilter";
import { GroupBySelect, GroupedTable, dayKey, type GroupByOption } from "./GroupedList";

// Shared Appointments / Home-Collection list. Reads `orders` (RLS scopes rows:
// staff = all, corporate = own org). Only bookings made through this platform
// carry scheduling — Crelio doesn't send it. `linkBase` = "/bills" (ops) or
// "/corporate/orders" (corporate portal).

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};
const STATUS_ORDER = ["booked", "collected", "accessioned", "report_generated", "completed", "report_sent"];
const CENTRE: Record<string, string> = {
  KYL: "Kalyan Nagar", JNR: "Jayanagar", KKP: "Kanakapura", BSK: "Banashankari",
};
const CENTRE_OPTS = Object.entries(CENTRE).map(([value, label]) => ({ value, label }));

function aggStatus(items: { status: string }[]): string {
  const active = (items ?? []).filter((i) => !["cancelled", "rejected"].includes(i.status));
  const pool = active.length ? active : items ?? [];
  if (!pool.length) return "booked";
  const idx = Math.min(...pool.map((i) => Math.max(0, STATUS_ORDER.indexOf(i.status))));
  return STATUS_ORDER[idx] ?? pool[0].status;
}
function fmtDateTime(v: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}
function fmtTime(v: string | null) {
  if (!v) return "";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

type Row = {
  id: string; order_number: string; patient_name: string | null; patient_mobile: string | null;
  centre_id: string; created_at: string;
  appointment_start: string | null; appointment_end: string | null;
  home_collection_at: string | null; home_collection_address: string | null;
  order_items: { status: string }[];
};

export function ScheduledList({ mode, title, linkBase, showCentre = true }: {
  mode: "appointment" | "home";
  title: string;
  linkBase: string;
  showCentre?: boolean;
}) {
  const navigate = useNavigate();
  const field = mode === "appointment" ? "appointment_start" : "home_collection_at";
  // Filter by booking_mode (a stable string), not a null-comparison on the
  // timestamp: Refine drops permanent filters whose value is null, which would
  // make the "All" view leak every order. booking_mode is stamped 1:1 with the
  // timestamp at booking time, so this is equivalent and robust.
  const modeValue = mode === "appointment" ? "appointment" : "home";

  const { tableProps, setFilters } = useTable<Row>({
    resource: "orders",
    meta: { select: "id, order_number, patient_name, patient_mobile, centre_id, created_at, appointment_start, appointment_end, home_collection_at, home_collection_address, order_items(status)" },
    filters: { permanent: [{ field: "booking_mode", operator: "eq", value: modeValue }] },
    sorters: { initial: [{ field, order: "asc" }] },
  });

  const [when, setWhen] = useState("upcoming");
  const [centre, setCentre] = useState<string>();
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  useEffect(() => {
    const f: CrudFilters = [];
    const now = new Date().toISOString();
    if (when === "upcoming") f.push({ field, operator: "gte", value: now });
    else if (when === "past") f.push({ field, operator: "lt", value: now });
    if (centre) f.push({ field: "centre_id", operator: "eq", value: centre });
    if (date) {
      f.push({ field, operator: "gte", value: date.start });
      f.push({ field, operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [when, centre, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleCol: ColumnsType<Row>[number] = mode === "appointment"
    ? {
        title: "Scheduled", width: 210,
        render: (_, r) => (
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 500 }}>{fmtDateTime(r.appointment_start)}</span>
            {r.appointment_end && <span style={{ color: "#888", fontSize: 11 }}>until {fmtTime(r.appointment_end)}</span>}
          </Space>
        ),
      }
    : {
        title: "Collection", width: 200,
        render: (_, r) => <span style={{ fontWeight: 500 }}>{fmtDateTime(r.home_collection_at)}</span>,
      };

  const columns: ColumnsType<Row> = [
    scheduleCol,
    {
      title: "Patient", width: 180,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <span>{r.patient_name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
          {r.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{r.patient_mobile}</span>}
        </Space>
      ),
    },
    ...(mode === "home" ? [{
      title: "Address",
      render: (_: unknown, r: Row) => (
        <span style={{ fontSize: 13 }}>{r.home_collection_address ?? "—"}</span>
      ),
    } as ColumnsType<Row>[number]] : []),
    {
      dataIndex: "order_items", title: "Status", width: 140,
      render: (items: { status: string }[]) => {
        const s = aggStatus(items);
        return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
      },
    },
    { dataIndex: "order_items", key: "tests", title: "Tests", width: 60, align: "center", render: (items: unknown[]) => items?.length ?? 0 },
    ...(showCentre ? [{ title: "Centre", width: 130, render: (_: unknown, r: Row) => CENTRE[r.centre_id] ?? r.centre_id } as ColumnsType<Row>[number]] : []),
    { dataIndex: "order_number", title: "Order #", width: 150, render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code> },
  ];

  const GROUPS: GroupByOption<Row>[] = [
    { value: "day", label: "Day", getKey: (r) => dayKey((mode === "appointment" ? r.appointment_start : r.home_collection_at)) },
    { value: "status", label: "Status", getKey: (r) => aggStatus(r.order_items).replace(/_/g, " ") },
    ...(showCentre ? [{ value: "centre", label: "Centre", getKey: (r: Row) => CENTRE[r.centre_id] ?? r.centre_id }] : []),
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ margin: "0 0 12px" }}>{title}</Typography.Title>
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Select value={when} style={{ width: 150 }} onChange={setWhen}
            options={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All" }]} />
        </Col>
        {showCentre && (
          <Col><Select placeholder="Centre" allowClear style={{ width: 150 }} value={centre} onChange={setCentre} options={CENTRE_OPTS} /></Col>
        )}
        <Col><DateFilter onChange={setDate} /></Col>
        <Col><GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} /></Col>
      </Row>

      <GroupedTable<Row>
        tableProps={tableProps}
        columns={columns}
        rowKey="id"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        onRow={(row) => ({ onClick: () => navigate(`${linkBase}/${row.id}`) })}
        totalLabel={mode === "appointment" ? "appointments" : "collections"}
      />
    </div>
  );
}
