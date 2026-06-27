import { useTable, List } from "@refinedev/antd";
import { Table, Tag, Select, Row, Col, Space, Button } from "antd";
import { useNavigate } from "react-router-dom";

const STATUS_COLOR: Record<string, string> = {
  booked: "blue",
  collected: "orange",
  accessioned: "gold",
  report_generated: "cyan",
};

const ACTIVE_STATUSES = ["booked", "collected", "accessioned", "report_generated"];

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(v));
}

type TestRow = {
  id: string;
  test_name: string;
  status: string;
  collected_at: string | null;
  reported_at: string | null;
  orders: {
    id: string;
    order_number: string;
    patient_name: string | null;
    patient_mobile: string | null;
    centres: { display_name: string } | null;
  } | null;
};

export function TestList() {
  const navigate = useNavigate();
  const { tableProps, setFilters } = useTable<TestRow>({
    resource: "order_items",
    filters: {
      permanent: [{ field: "status", operator: "in", value: ACTIVE_STATUSES }],
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    meta: {
      select: "id, test_name, status, collected_at, reported_at, orders!inner(id, order_number, patient_name, patient_mobile, centres(display_name))",
    },
  });

  return (
    <List title="Ongoing Tests">
      <Row gutter={8} style={{ marginBottom: 16 }}>
        <Col>
          <Select
            placeholder="Filter by status"
            style={{ width: 200 }}
            allowClear
            options={ACTIVE_STATUSES.map((s) => ({
              value: s,
              label: <Tag color={STATUS_COLOR[s]}>{s.replace(/_/g, " ")}</Tag>,
            }))}
            onChange={(v) =>
              setFilters(
                v
                  ? [{ field: "status", operator: "eq", value: v }]
                  : [{ field: "status", operator: "in", value: ACTIVE_STATUSES }]
              )
            }
          />
        </Col>
      </Row>

      <Table<TestRow>
        {...tableProps}
        rowKey="id"
        size="small"
        pagination={{
          ...tableProps.pagination,
          showSizeChanger: true,
          showTotal: (t) => `${t} active tests`,
        }}
      >
        <Table.Column<TestRow>
          dataIndex="test_name"
          title="Test / Scan"
        />
        <Table.Column<TestRow>
          dataIndex="status"
          title="Status"
          width={155}
          render={(v: string) => (
            <Tag color={STATUS_COLOR[v] ?? "default"}>{v.replace(/_/g, " ")}</Tag>
          )}
        />
        <Table.Column<TestRow>
          title="Patient"
          width={180}
          render={(_, row) => (
            <Space direction="vertical" size={0}>
              <span>{row.orders?.patient_name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
              {row.orders?.patient_mobile && (
                <span style={{ color: "#888", fontSize: 11 }}>{row.orders.patient_mobile}</span>
              )}
            </Space>
          )}
        />
        <Table.Column<TestRow>
          title="Centre"
          width={140}
          render={(_, row) => row.orders?.centres?.display_name ?? "—"}
        />
        <Table.Column<TestRow>
          dataIndex="collected_at"
          title="Collected"
          width={140}
          render={(v) => fmtDate(v)}
        />
        <Table.Column<TestRow>
          title="Bill"
          width={160}
          render={(_, row) => (
            <Button
              size="small"
              type="link"
              style={{ padding: 0 }}
              onClick={() => row.orders?.id && navigate(`/bills/${row.orders.id}`)}
            >
              <code style={{ fontSize: 11 }}>{row.orders?.order_number}</code>
            </Button>
          )}
        />
      </Table>
    </List>
  );
}
