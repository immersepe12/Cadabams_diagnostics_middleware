import { ScheduledList } from "../../components/ScheduledList";

// Corporate portal — RLS scopes `orders` to the corporate's own orgs, so this
// shows only their appointments. Rows link into the corporate order detail.
export function CorporateAppointments() {
  return <ScheduledList mode="appointment" title="Appointments" linkBase="/corporate/orders" />;
}
