import { useTable, List } from "@refinedev/antd";
import { Table, Tag, Select, Row, Col, Space, Button } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "../../components/DateFilter";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", report_sent: "green", cancelled: "red", rejected: "red",
};

const PENDING = ["booked", "collected", "accessioned"];
const ACTIVE = ["booked", "collected", "accessioned", "report_generated"];

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

type Row = {
  id: string; order_id: string; test_name: string; status: string;
  department: string | null; centre_id: string; order_number: string;
  patient_name: string | null; patient_mobile: string | null; created_at: string;
};

export function RadiologyList() {
  const navigate = useNavigate();
  const { tableProps, setFilters } = useTable<Row>({
    resource: "order_items_view",
    filters: { permanent: [{ field: "service_line", operator: "eq", value: "radiology" }] },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
  });

  const [status, setStatus] = useState("pending");
  const [centre, setCentre] = useState<string>();
  const [date, setDate] = useState<DateRange>(null);

  useEffect(() => {
    const f: CrudFilters = [];
    if (status === "pending") f.push({ field: "status", operator: "in", value: PENDING });
    else if (status === "active") f.push({ field: "status", operator: "in", value: ACTIVE });
    else if (status !== "all") f.push({ field: "status", operator: "eq", value: status });
    if (centre) f.push({ field: "centre_id", operator: "eq", value: centre });
    if (date) {
      f.push({ field: "created_at", operator: "gte", value: date.start });
      f.push({ field: "created_at", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [status, centre, date]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <List title="Radiology — Scans">
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            value={status}
            style={{ width: 220 }}
            onChange={setStatus}
            options={[
              { value: "pending", label: "Pending (booked → accessioned)" },
              { value: "active", label: "Active (incl. report ready)" },
              { value: "all", label: "All statuses" },
              { value: "booked", label: "Booked" },
              { value: "collected", label: "Collected" },
              { value: "report_generated", label: "Report ready" },
              { value: "report_sent", label: "Report sent" },
            ]}
          />
        </Col>
        <Col>
          <Select placeholder="Centre" allowClear style={{ width: 150 }} value={centre} onChange={setCentre} options={CENTRE_OPTS} />
        </Col>
        <Col>
          <DateFilter onChange={setDate} />
        </Col>
      </Row>

      <Table<Row> {...tableProps} rowKey="id" size="small" scroll={{ x: "max-content" }}
        pagination={{ ...tableProps.pagination, showSizeChanger: true, showTotal: (t) => `${t} scans` }}>
        <Table.Column<Row> title="Scan" render={(_, r) => (
          <Space direction="vertical" size={0}>
            <span>{r.test_name}</span>
            {r.department && <span style={{ color: "#aaa", fontSize: 11 }}>{r.department}</span>}
          </Space>
        )} />
        <Table.Column<Row> dataIndex="status" title="Status" width={150}
          render={(v: string) => <Tag color={STATUS_COLOR[v] ?? "default"}>{v?.replace(/_/g, " ")}</Tag>} />
        <Table.Column<Row> title="Patient" width={180} render={(_, r) => (
          <Space direction="vertical" size={0}>
            <span>{r.patient_name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
            {r.patient_mobile && <span style={{ color: "#888", fontSize: 11 }}>{r.patient_mobile}</span>}
          </Space>
        )} />
        <Table.Column<Row> title="Centre" width={140} render={(_, r) => CENTRE[r.centre_id] ?? r.centre_id} />
        <Table.Column<Row> dataIndex="created_at" title="Booked" width={140} render={(v) => fmtDate(v)} />
        <Table.Column<Row> title="Bill" width={150} render={(_, r) => (
          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => navigate(`/bills/${r.order_id}`)}>
            <code style={{ fontSize: 11 }}>{r.order_number}</code>
          </Button>
        )} />
      </Table>
    </List>
  );
}
