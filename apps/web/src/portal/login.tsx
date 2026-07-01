import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { supabaseClient } from "../lib/supabase";

// Patient login: phone OTP via Supabase native phone auth. Delivery goes through
// the Supabase "Send SMS" hook → Fyno. This bypasses Refine's authProvider
// entirely (that stays staff email/password).
//
// India only: accept a 10-digit mobile, send as E.164 (+91…). This must match
// how orders.patient_mobile was captured (10-digit) so RLS resolves the patient.

function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  const ten = d.length > 10 ? d.slice(-10) : d;
  return ten.length === 10 ? `+91${ten}` : null;
}

export function PortalLogin() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendOtp(values: { mobile: string }) {
    const e164 = toE164(values.mobile);
    if (!e164) { message.error("Enter a valid 10-digit mobile number"); return; }
    setBusy(true);
    try {
      const { error } = await supabaseClient.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      setPhone(e164);
      setPhase("otp");
      message.success("OTP sent to your mobile");
    } catch (err) {
      message.error((err as Error)?.message ?? "Could not send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verify(values: { token: string }) {
    setBusy(true);
    try {
      const { error } = await supabaseClient.auth.verifyOtp({
        phone,
        token: values.token.trim(),
        type: "sms",
      });
      if (error) throw error;
      navigate("/portal", { replace: true });
    } catch (err) {
      message.error((err as Error)?.message ?? "Invalid or expired code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
      <Card style={{ width: 360 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>My Reports</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
          Sign in with your mobile number to view your diagnostic reports.
        </Typography.Paragraph>

        {phase === "phone" ? (
          <Form layout="vertical" onFinish={sendOtp}>
            <Form.Item name="mobile" label="Mobile number" rules={[{ required: true }]}>
              <Input addonBefore="+91" placeholder="10-digit number" maxLength={10} inputMode="numeric" autoFocus />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={busy}>Send OTP</Button>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={verify}>
            <Typography.Paragraph type="secondary">Code sent to {phone}</Typography.Paragraph>
            <Form.Item name="token" label="Enter OTP" rules={[{ required: true }]}>
              <Input placeholder="6-digit code" maxLength={6} inputMode="numeric" autoFocus />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={busy}>Verify &amp; sign in</Button>
            <Button type="link" block onClick={() => setPhase("phone")} style={{ marginTop: 8 }}>
              Change number
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
