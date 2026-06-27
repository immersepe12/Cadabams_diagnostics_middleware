import { useTable, List } from "@refinedev/antd";
import { Table, Input, Button, Space, Alert } from "antd";
import { SearchOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

type Patient = {
  mobile: string;
  name: string | null;
  bill_count: number;
  last_visit: string;
};

function fmtDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(new Date(v));
}

export function PatientList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  // Reads the `patients` SQL view (orders grouped by phone) — server-paginated.
  const { tableProps, setFilters } = useTable<Patient>({
    resource: "patients",
    pagination: { pageSize: 25 },
    sorters: { initial: [{ field: "last_visit", order: "desc" }] },
  });

  function applySearch(val: string) {
    setQuery(val);
    setFilters(
      val
        ? [{
            operator: "or",
            value: [
              { field: "mobile", operator: "contains", value: val },
              { field: "name", operator: "contains", value: val },
            ],
          }]
        : [],
      "replace",
    );
  }

  return (
    <List title="Patients">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Patients appear here as Crelio webhooks arrive (new bills, registrations, reports) — the dashboard mirrors them automatically. Crelio has no patient-search API, so there's no manual lookup."
      />

      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Name or mobile"
          prefix={<SearchOutlined />}
          style={{ width: 260 }}
          value={query}
          onChange={(e) => applySearch(e.target.value)}
          allowClear
        />
      </Space>

      <Table<Patient>
        {...tableProps}
        rowKey="mobile"
        size="small"
        onRow={(row) => ({ onClick: () => navigate(`/patients/${row.mobile}`) })}
        style={{ cursor: "pointer" }}
        pagination={{ ...tableProps.pagination, showSizeChanger: true, showTotal: (t) => `${t} patients` }}
      >
        <Table.Column<Patient>
          title="Patient"
          render={(_, row) => (
            <Space>
              <UserOutlined style={{ color: "#888" }} />
              <Space direction="vertical" size={0}>
                <span>{row.name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
                <span style={{ color: "#888", fontSize: 11 }}>{row.mobile}</span>
              </Space>
            </Space>
          )}
        />
        <Table.Column<Patient>
          dataIndex="bill_count"
          title="Bills"
          width={80}
          align="center"
          sorter
        />
        <Table.Column<Patient>
          dataIndex="last_visit"
          title="Last Visit"
          width={130}
          render={(v: string) => fmtDate(v)}
          sorter
          defaultSortOrder="descend"
        />
        <Table.Column<Patient>
          width={80}
          render={(_, row) => (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/patients/${row.mobile}`);
              }}
            >
              View
            </Button>
          )}
        />
      </Table>
    </List>
  );
}
