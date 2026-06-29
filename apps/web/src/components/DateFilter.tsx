import { useState } from "react";
import { Select, DatePicker, Space } from "antd";
import dayjs, { type Dayjs } from "dayjs";

// Monday-based week start (common for IN/business reporting).
function mondayOf(d: Dayjs) {
  return d.subtract((d.day() + 6) % 7, "day").startOf("day");
}

export type DateRange = { start: string; end: string } | null;

// Half-open range [start, end) as ISO strings, or null for "all time".
export function presetRange(key: string): DateRange {
  const now = dayjs();
  let s: Dayjs, e: Dayjs;
  switch (key) {
    case "today":     s = now.startOf("day");   e = s.add(1, "day");   break;
    case "thisWeek":  s = mondayOf(now);        e = s.add(1, "week");  break;
    case "lastWeek":  e = mondayOf(now);        s = e.subtract(1, "week"); break;
    case "thisMonth": s = now.startOf("month"); e = s.add(1, "month"); break;
    case "lastMonth": e = now.startOf("month"); s = e.subtract(1, "month"); break;
    default: return null;
  }
  return { start: s.toISOString(), end: e.toISOString() };
}

const PRESETS = [
  { value: "all",       label: "All time" },
  { value: "today",     label: "Today" },
  { value: "thisWeek",  label: "This week" },
  { value: "lastWeek",  label: "Last week" },
  { value: "thisMonth", label: "This month" },
  { value: "lastMonth", label: "Last month" },
];

// Preset dropdown + custom range picker. A custom range overrides the preset;
// picking a preset clears the custom range.
export function DateFilter({ onChange }: { onChange: (r: DateRange) => void }) {
  const [preset, setPreset] = useState("all");
  const [custom, setCustom] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  return (
    <Space wrap>
      <Select
        value={custom ? "custom" : preset}
        style={{ width: 140 }}
        onChange={(v) => { setPreset(v); setCustom(null); onChange(presetRange(v)); }}
        options={custom ? [...PRESETS, { value: "custom", label: "Custom range" }] : PRESETS}
      />
      <DatePicker.RangePicker
        value={custom as any}
        allowClear
        onChange={(v) => {
          if (v && v[0] && v[1]) {
            setCustom(v as [Dayjs, Dayjs]);
            onChange({ start: v[0].startOf("day").toISOString(), end: v[1].endOf("day").toISOString() });
          } else {
            setCustom(null);
            onChange(presetRange(preset));
          }
        }}
      />
    </Space>
  );
}
