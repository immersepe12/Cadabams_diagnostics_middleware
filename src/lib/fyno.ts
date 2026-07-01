// SMS provider seam. The Supabase "Send SMS" auth hook calls us with a phone +
// OTP; we deliver via Fyno. Swapping providers (or stubbing in dev) means
// changing only this file.
//
// ⚠️ Fyno's exact OTP trigger endpoint / payload / template id are not yet wired
//    in this repo. The shape below is a placeholder; fill it in once credentials
//    and a test SMS template exist. Everything else (hook, signature check) is final.

export interface SmsSender {
  sendOtp(toE164: string, otp: string): Promise<void>;
}

// Fyno "fire an event" API (endpoint per this workspace's own sample curl — note
// there is NO /live|/test version segment; the API key's environment decides):
//   POST https://api.fyno.io/v1/{WSID}/event
//   Authorization: Bearer <api key>
//   { event, to: { sms: "+91…" }, data: { otp } }
// WSID + key come from Fyno → API Keys. The event (default SigninOTP) is authored
// in Fyno; its SMS body must reference the code as {{data.otp}}.
const host = process.env.FYNO_API_BASE ?? "https://api.fyno.io";
const wsid = process.env.FYNO_WSID ?? "";
const apiKey = process.env.FYNO_API_KEY ?? "";
const otpEvent = process.env.FYNO_OTP_EVENT ?? "SigninOTP";
// The SigninOTP SMS body reads "{{OTP}}" (top-level, uppercase), so the code goes
// under data.OTP — not data.otp. Overridable if the template var ever changes.
const otpVar = process.env.FYNO_OTP_VAR ?? "OTP";

export const fynoSender: SmsSender = {
  async sendOtp(toE164, otp) {
    if (!wsid || !apiKey) throw new Error("Fyno not configured (FYNO_WSID / FYNO_API_KEY)");

    // Fyno wants E.164 with a leading +; Supabase's hook phone may omit it.
    const sms = toE164.startsWith("+") ? toE164 : `+${toE164.replace(/\D/g, "")}`;

    const res = await fetch(`${host}/v1/${wsid}/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        event: otpEvent,
        to: { sms },
        data: { [otpVar]: otp }, // → {{OTP}} in the SigninOTP template
      }),
    });
    if (!res.ok) {
      throw new Error(`Fyno send failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  },
};

// Dev fallback: log the OTP instead of sending. Selected when FYNO_API_BASE is
// unset, so the whole flow is testable before Fyno creds land.
export const consoleSender: SmsSender = {
  async sendOtp(toE164, otp) {
    console.log(`[sms-stub] OTP for ${toE164}: ${otp}`);
  },
};

export const smsSender: SmsSender = wsid && apiKey ? fynoSender : consoleSender;
