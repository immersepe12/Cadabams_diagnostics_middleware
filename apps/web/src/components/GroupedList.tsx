import { Table, Select, Pagination, Tag } from "antd";
import type { TableProps } from "antd";
import type { ColumnsType } from "antd/es/table";
import { BRAND } from "../theme";

// Group-by for every ops list. With no grouping the table renders exactly as
// before (server pagination intact). With a grouping picked, the CURRENT PAGE's
// rows are grouped client-side into sections — a header bar (label + count) and
// a table per group — with the server pagination kept below.

export type GroupByOption<T> = {
  value: string;                 // option id, e.g. "centre"
  label: string;                 // "Centre"
  getKey: (row: T) => string;    // grouping key + display label
};

export function GroupBySelect<T>({ value, onChange, options, width = 180 }: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: GroupByOption<T>[];
  width?: number;
}) {
  return (
    <Select
      value={value ?? "none"}
      style={{ width }}
      onChange={(v) => onChange(v === "none" ? null : v)}
      options={[
        { value: "none", label: "Group: none" },
        ...options.map((o) => ({ value: o.value, label: `Group: ${o.label}` })),
      ]}
    />
  );
}

export function GroupedTable<T extends object>({ tableProps, columns, rowKey, groupBy, onRow, totalLabel }: {
  tableProps: TableProps<T>;
  columns: ColumnsType<T>;
  rowKey: string;
  groupBy: GroupByOption<T> | null;
  onRow?: TableProps<T>["onRow"];
  totalLabel?: string; // e.g. "bills"
}) {
  const pagination = {
    ...(typeof tableProps.pagination === "object" ? tableProps.pagination : {}),
    showSizeChanger: true,
    ...(totalLabel ? { showTotal: (t: number) => `${t} ${totalLabel}` } : {}),
  };

  if (!groupBy) {
    return (
      <Table<T>
        {...tableProps}
        columns={columns}
        rowKey={rowKey}
        size="small"
        scroll={{ x: "max-content" }}
        onRow={onRow}
        style={onRow ? { cursor: "pointer" } : undefined}
        pagination={pagination}
      />
    );
  }

  // Group the loaded page's rows, preserving first-occurrence order (the data
  // is already server-sorted, so groups follow the current sort).
  const rows = (tableProps.dataSource ?? []) as T[];
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = groupBy.getKey(r) || "—";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }

  return (
    <div>
      {[...groups.entries()].map(([label, groupRows]) => (
        <div key={label} style={{ marginBottom: 20 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, margin: "0 0 8px 2px",
          }}>
            <span style={{ width: 3, height: 16, borderRadius: 2, background: BRAND.primary }} />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{label}</span>
            <Tag style={{ marginLeft: 2, background: BRAND.primarySoft, color: BRAND.primary, border: "none" }}>
              {groupRows.length}
            </Tag>
          </div>
          <Table<T>
            dataSource={groupRows}
            columns={columns}
            rowKey={rowKey}
            size="small"
            scroll={{ x: "max-content" }}
            onRow={onRow}
            style={onRow ? { cursor: "pointer" } : undefined}
            pagination={false}
          />
        </div>
      ))}
      {rows.length === 0 && (
        <Table<T> dataSource={[]} columns={columns} rowKey={rowKey} size="small" pagination={false}
          loading={tableProps.loading} />
      )}
      <Pagination
        {...pagination}
        style={{ marginTop: 4, textAlign: "right" }}
        onChange={(page, pageSize) =>
          (tableProps as { onChange?: (p: unknown, f: unknown, s: unknown, e: unknown) => void })
            .onChange?.({ ...pagination, current: page, pageSize }, {}, {}, { action: "paginate", currentDataSource: rows })
        }
      />
    </div>
  );
}

// Shared date helpers for date-based grouping.
export function dayKey(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
}
export function monthKey(v: string | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(v));
}
