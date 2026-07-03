import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, Row, Col, Statistic, Table, Tag, Button, Typography, Spin } from "antd";
import { CalendarOutlined, FileDoneOutlined, ClockCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { supabaseClient } from "../../lib/supabase";
import { BRAND } from "../../theme";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue", collected: "orange", accessioned: "gold",
  report_generated: "cyan", completed: "geekblue", report_sent: "green",
  cancelled: "red", rejected: "red",
};

type Recent = {
  id: string; order_number: string; patient_name: string | null;
  centre_id: string; created_at: string;
  order_items: { status: string }[];
};

function aggStatus(items: { status: string }[]): string {
  const order = ["booked", "collected", "accessioned", "report_generated", "completed", "report_sent"];
  const active = items.filter((i) => !["cancelled", "rejected"].includes(i.status));
  const pool = active.length ? active : items;
  if (!pool.length) return "booked";
  const idx = Math.min(...pool.map((i) => Math.max(0, order.indexOf(i.status))));
  return order[idx] ?? pool[0].status;
}

function fmtDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

// Corporate landing: this-month counts + recent orders. All queries are
// RLS-scoped to the corporate's orgs, so plain counts are safe.
export function CorporateDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ month: 0, pending: 0, reported: 0 });
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => {
    (async () => {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

      const [m, p, r, rec] = await Promise.all([
        supabaseClient.from("orders").select("id", { count: "exact", head: true })
          .gte("created_at", monthStart.toISOString()),
        supabaseClient.from("order_items").select("id", { count: "exact", head: true })
          .in("status", ["booked", "collected", "accessioned"]),
        supabaseClient.from("reports").select("id", { count: "exact", head: true }),
        supabaseClient.from("orders")
          .select("id, order_number, patient_name, centre_id, created_at, order_items(status)")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);
      setStats({ month: m.count ?? 0, pending: p.count ?? 0, reported: r.count ?? 0 });
      setRecent((rec.data as Recent[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display: "grid", placeItems: "center", height: "50vh" }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Overview</Typography.Title>
        <Link to="/corporate/book">
          <Button type="primary" icon={<PlusOutlined />}>Book appointment</Button>
        </Link>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card styles={{ body: { padding: 18 } }}>
            <Statistic title="Orders this month" value={stats.month}
              prefix={<CalendarOutlined style={{ color: BRAND.primary }} />} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card styles={{ body: { padding: 18 } }}>
            <Statistic title="Tests in progress" value={stats.pending}
              prefix={<ClockCircleOutlined style={{ color: "#D97706" }} />} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card styles={{ body: { padding: 18 } }}>
            <Statistic title="Reports available" value={stats.reported}
              prefix={<FileDoneOutlined style={{ color: BRAND.primary }} />} />
          </Card>
        </Col>
      </Row>

      <Card title="Recent orders" extra={<Link to="/corporate/orders">All orders →</Link>} styles={{ body: { padding: 0 } }}>
        <Table<Recent>
          dataSource={recent} rowKey="id" size="small" pagination={false}
          scroll={{ x: "max-content" }}
          onRow={(r) => ({ onClick: () => navigate(`/corporate/orders/${r.id}`) })}
          style={{ cursor: "pointer" }}
        >
          <Table.Column<Recent> title="Order #" width={150}
            render={(_, r) => <code style={{ fontSize: 12 }}>{r.order_number}</code>} />
          <Table.Column<Recent> title="Patient" render={(_, r) => r.patient_name ?? "—"} />
          <Table.Column<Recent> title="Status" width={140} render={(_, r) => {
            const s = aggStatus(r.order_items ?? []);
            return <Tag color={STATUS_COLOR[s] ?? "default"}>{s.replace(/_/g, " ")}</Tag>;
          }} />
          <Table.Column<Recent> title="Booked" width={140} render={(_, r) => fmtDate(r.created_at)} />
        </Table>
      </Card>
    </div>
  );
}
