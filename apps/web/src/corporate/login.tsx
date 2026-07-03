import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Typography, message } from "antd";
import { BankOutlined } from "@ant-design/icons";
import { supabaseClient } from "../lib/supabase";
import { BRAND } from "../theme";

// Corporate login: email/password (accounts are provisioned by Cadabams admins;
// the generated password is shared once and can be changed in the portal).
export function CorporateLogin() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function signIn(values: { email: string; password: string }) {
    setBusy(true);
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });
      if (error) throw error;
      const role = (data.user?.app_metadata as { role?: string })?.role;
      if (role === "staff" || role === "admin") { navigate("/bills", { replace: true }); return; }
      if (role !== "corporate") {
        await supabaseClient.auth.signOut();
        throw new Error("This login is not a corporate account.");
      }
      navigate("/corporate", { replace: true });
    } catch (err) {
      message.error((err as Error)?.message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", background: BRAND.bgLayout, padding: 16 }}>
      <Card style={{ width: "100%", maxWidth: 400, borderRadius: 14 }} styles={{ body: { padding: 24 } }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: BRAND.primarySoft, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <BankOutlined style={{ color: BRAND.primary, fontSize: 26 }} />
          </div>
          <Typography.Title level={3} style={{ margin: "12px 0 2px" }}>Corporate Portal</Typography.Title>
          <Typography.Text type="secondary">Cadabams Diagnostics</Typography.Text>
        </div>

        <Form layout="vertical" onFinish={signIn} requiredMark={false}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
            <Input size="large" autoComplete="email" placeholder="you@company.com" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" size="large" htmlType="submit" block loading={busy}>Sign in</Button>
          <Typography.Paragraph type="secondary" style={{ fontSize: 12, textAlign: "center", margin: "12px 0 0" }}>
            Accounts are provisioned by Cadabams. Contact your account manager for access.
          </Typography.Paragraph>
        </Form>
      </Card>
    </div>
  );
}
