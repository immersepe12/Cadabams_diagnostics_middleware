import { useList } from "@refinedev/core";
import { List } from "@refinedev/antd";
import { Table, Input, Button, Space } from "antd";
import { SearchOutlined, UserOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";

type Order = {
  patient_mobile: string;
  patient_name: string | null;
  created_at: string;
};

type Patient = {
  mobile: string;
  name: string | null;
  bill_count: number;
  last_visit: string;
};

function fmtDate(v: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
}

export function PatientList() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useList<Order>({
    resource: "orders",
    pagination: { pageSize: 9999 },
    meta: { select: "patient_mobile, patient_name, created_at" },
  });

  const patients: Patient[] = useMemo(() => {
    const map = new Map<string, Patient>();
    for (const o of data?.data ?? []) {
      if (!o.patient_mobile) continue;
      const existing = map.get(o.patient_mobile);
      if (!existing) {
        map.set(o.patient_mobile, {
          mobile: o.patient_mobile,
          name: o.patient_name,
          bill_count: 1,
          last_visit: o.created_at,
        });
      } else {
        existing.bill_count++;
        if (o.created_at > existing.last_visit) {
          existing.last_visit = o.created_at;
          if (o.patient_name && !existing.name) existing.name = o.patient_name;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => b.last_visit.localeCompare(a.last_visit)
    );
  }, [data?.data]);

  const filtered = useMemo(() => {
    if (!search) return patients;
    const q = search.toLowerCase();
    return patients.filter(
      (p) =>
        p.mobile.includes(q) ||
        (p.name ?? "").toLowerCase().includes(q)
    );
  }, [patients, search]);

  return (
    <List title={`Patients (${patients.length})`}>
      <Input.Search
        placeholder="Name or mobile"
        prefix={<SearchOutlined />}
        style={{ width: 260, marginBottom: 16 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
      />

      <Table
        dataSource={filtered}
        rowKey="mobile"
        loading={isLoading}
        size="small"
        onRow={(row) => ({ onClick: () => navigate(`/patients/${row.mobile}`) })}
        pagination={{ showSizeChanger: true, showTotal: (t) => `${t} patients` }}
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
        />
        <Table.Column<Patient>
          dataIndex="last_visit"
          title="Last Visit"
          width={130}
          render={(v: string) => fmtDate(v)}
          sorter={(a, b) => a.last_visit.localeCompare(b.last_visit)}
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
