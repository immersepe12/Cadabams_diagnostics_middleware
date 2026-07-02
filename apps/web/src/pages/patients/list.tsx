import { useTable, List } from "@refinedev/antd";
import { Input, Button, Space, Alert } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SearchOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import type { CrudFilters } from "@refinedev/core";
import { DateFilter, type DateRange } from "../../components/DateFilter";
import { GroupBySelect, GroupedTable, dayKey, monthKey, type GroupByOption } from "../../components/GroupedList";

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

const GROUPS: GroupByOption<Patient>[] = [
  { value: "visit_day", label: "Last visit (day)", getKey: (r) => dayKey(r.last_visit) },
  { value: "visit_month", label: "Last visit (month)", getKey: (r) => monthKey(r.last_visit) },
  { value: "bills", label: "Bill count", getKey: (r) => `${r.bill_count} bill${r.bill_count === 1 ? "" : "s"}` },
];

export function PatientList() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<DateRange>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);

  // Reads the `patients` SQL view (orders grouped by phone) — server-paginated.
  const { tableProps, setFilters } = useTable<Patient>({
    resource: "patients",
    pagination: { pageSize: 25 },
    sorters: { initial: [{ field: "last_visit", order: "desc" }] },
  });

  useEffect(() => {
    const f: CrudFilters = [];
    if (query) f.push({
      operator: "or",
      value: [
        { field: "mobile", operator: "contains", value: query },
        { field: "name", operator: "contains", value: query },
      ],
    });
    if (date) {
      f.push({ field: "last_visit", operator: "gte", value: date.start });
      f.push({ field: "last_visit", operator: "lt", value: date.end });
    }
    setFilters(f, "replace");
  }, [query, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: ColumnsType<Patient> = [
    {
      title: "Patient",
      render: (_, row) => (
        <Space>
          <UserOutlined style={{ color: "#888" }} />
          <Space direction="vertical" size={0}>
            <span>{row.name ?? <em style={{ color: "#aaa" }}>No name</em>}</span>
            <span style={{ color: "#888", fontSize: 11 }}>{row.mobile}</span>
          </Space>
        </Space>
      ),
    },
    { dataIndex: "bill_count", title: "Bills", width: 80, align: "center", sorter: true },
    {
      dataIndex: "last_visit", title: "Last Visit", width: 130,
      render: (v: string) => fmtDate(v), sorter: true, defaultSortOrder: "descend",
    },
    {
      width: 80,
      render: (_, row) => (
        <Button size="small" onClick={(e) => { e.stopPropagation(); navigate(`/patients/${row.mobile}`); }}>
          View
        </Button>
      ),
    },
  ];

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
          onChange={(e) => setQuery(e.target.value)}
          allowClear
        />
        <DateFilter onChange={setDate} />
        <GroupBySelect value={groupKey} onChange={setGroupKey} options={GROUPS} />
      </Space>

      <GroupedTable<Patient>
        tableProps={tableProps}
        columns={columns}
        rowKey="mobile"
        groupBy={GROUPS.find((g) => g.value === groupKey) ?? null}
        onRow={(row) => ({ onClick: () => navigate(`/patients/${row.mobile}`) })}
        totalLabel="patients"
      />
    </List>
  );
}
