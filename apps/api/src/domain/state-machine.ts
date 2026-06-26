// Maps Crelio webhook status strings → our canonical order_item status.
// Crelio is inconsistent with casing so we normalise to lowercase first.

export type OrderItemStatus =
  | "booked"
  | "collected"
  | "accessioned"
  | "report_generated"
  | "report_sent"
  | "cancelled"
  | "rejected";

export type EventType =
  | "bill_generated"
  | "sample_collected"
  | "sample_accessioned"
  | "report_submitted"
  | "report_sent"
  | "bill_cancelled"
  | "item_rejected";

interface StatusMapping {
  eventType: EventType;
  orderItemStatus: OrderItemStatus;
  timestampField?: "collected_at" | "accessioned_at" | "reported_at";
}

export function mapCrelioStatus(rawStatus: string): StatusMapping | null {
  const s = rawStatus.toLowerCase().trim();

  if (s.includes("bill") && (s.includes("generat") || s.includes("creat")))
    return { eventType: "bill_generated", orderItemStatus: "booked" };

  if (s.includes("collect"))
    return { eventType: "sample_collected", orderItemStatus: "collected", timestampField: "collected_at" };

  if (s.includes("receiv") || s.includes("accession"))
    return { eventType: "sample_accessioned", orderItemStatus: "accessioned", timestampField: "accessioned_at" };

  if ((s.includes("report") && s.includes("submit")) || s.includes("result"))
    return { eventType: "report_submitted", orderItemStatus: "report_generated", timestampField: "reported_at" };

  if (s.includes("report") && s.includes("sent") || s.includes("deliver"))
    return { eventType: "report_sent", orderItemStatus: "report_sent" };

  if (s.includes("cancel") || s.includes("reset"))
    return { eventType: "bill_cancelled", orderItemStatus: "cancelled" };

  if (s.includes("reject") || s.includes("dismiss"))
    return { eventType: "item_rejected", orderItemStatus: "rejected" };

  return null;
}

// Guard: only allow valid forward transitions (or same-status idempotency).
// Prevents a late-arriving webhook from regressing a completed status.
const STATUS_ORDER: OrderItemStatus[] = [
  "booked", "collected", "accessioned", "report_generated", "report_sent",
];

export function canTransition(from: OrderItemStatus, to: OrderItemStatus): boolean {
  if (to === "cancelled" || to === "rejected") return true; // terminal states always allowed
  const fromIdx = STATUS_ORDER.indexOf(from);
  const toIdx = STATUS_ORDER.indexOf(to);
  return toIdx >= fromIdx;
}
