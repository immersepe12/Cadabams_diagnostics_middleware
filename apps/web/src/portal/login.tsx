import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
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
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: "#f5f7fa", padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 400, borderRadius: 14 }} styles={{ body: { padding: 24 } }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#e6f0ff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <ExperimentOutlined style={{ color: "#1677ff", fontSize: 26 }} />
          </div>
          <Typography.Title level={3} style={{ margin: "12px 0 2px" }}>My Reports</Typography.Title>
          <Typography.Text type="secondary">Cadabams Diagnostics</Typography.Text>
        </div>

        {phase === "phone" ? (
          <Form layout="vertical" onFinish={sendOtp} requiredMark={false}>
            <Form.Item name="mobile" label="Mobile number" rules={[{ required: true, message: "Enter your mobile number" }]}>
              <Input size="large" addonBefore="+91" placeholder="10-digit number" maxLength={10}
                inputMode="numeric" autoComplete="tel" autoFocus />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" block loading={busy}>Send OTP</Button>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, textAlign: "center", margin: "12px 0 0" }}>
              You’ll receive a one-time code by SMS.
            </Typography.Paragraph>
          </Form>
        ) : (
          <Form layout="vertical" onFinish={verify} requiredMark={false}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              Enter the 6-digit code sent to <b>{phone}</b>.
            </Typography.Paragraph>
            <Form.Item name="token" label="OTP" rules={[{ required: true, message: "Enter the code" }]}>
              <Input size="large" placeholder="••••••" maxLength={6} inputMode="numeric"
                autoComplete="one-time-code" autoFocus
                style={{ letterSpacing: 6, textAlign: "center", fontSize: 20, fontWeight: 600 }} />
            </Form.Item>
            <Button type="primary" size="large" htmlType="submit" block loading={busy}>Verify &amp; sign in</Button>
            <Button type="link" block onClick={() => setPhase("phone")} style={{ marginTop: 8 }}>
              Change number
            </Button>
          </Form>
        )}
      </Card>
    </div>
  );
}
