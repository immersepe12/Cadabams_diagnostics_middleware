// Report delivery seam. When a radiology report is finalized and "sent", the
// patient is notified via Fyno (WhatsApp / email / SMS) with a link to the report.
// Mirrors src/lib/fyno.ts. The transition + this call are wired now; actual
// delivery goes live once the Fyno report templates + FYNO_REPORT_EVENT are set —
// until then it's a console stub so the whole flow is exercisable end-to-end.

export interface ReportRecipient {
  mobile: string | null;   // 10-digit; sent as +91… over SMS/WhatsApp
  email?: string | null;
  name?: string | null;
}

export interface ReportDelivery {
  sendReport(to: ReportRecipient, ctx: { testName: string; reportUrl: string | null }): Promise<void>;
}

const host = process.env.FYNO_API_BASE ?? "https://api.fyno.io";
const wsid = process.env.FYNO_WSID ?? "";
const apiKey = process.env.FYNO_API_KEY ?? "";
const reportEvent = process.env.FYNO_REPORT_EVENT ?? "";

function toE164(mobile: string | null): string | null {
  if (!mobile) return null;
  const d = mobile.replace(/\D/g, "");
  return d ? `+${d.length > 10 ? d : `91${d}`}` : null;
}

export const fynoReportDelivery: ReportDelivery = {
  async sendReport(to, ctx) {
    const res = await fetch(`${host}/v1/${wsid}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        event: reportEvent,
        to: { sms: toE164(to.mobile), whatsapp: toE164(to.mobile), email: to.email ?? undefined },
        data: { name: to.name ?? "", testName: ctx.testName, reportUrl: ctx.reportUrl ?? "" },
      }),
    });
    if (!res.ok) throw new Error(`Fyno report send failed: ${res.status} ${await res.text().catch(() => "")}`);
  },
};

export const consoleReportDelivery: ReportDelivery = {
  async sendReport(to, ctx) {
    console.log(`[report-stub] would deliver "${ctx.testName}" to ${to.mobile ?? to.email ?? "?"} (templates not wired)`);
  },
};

// Real delivery only once WSID + key + a report template/event are all configured.
export const reportDelivery: ReportDelivery =
  wsid && apiKey && reportEvent ? fynoReportDelivery : consoleReportDelivery;
