import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Layout, Button, Grid, Typography, Dropdown, Modal, Form, Input, message } from "antd";
import { BankOutlined, LogoutOutlined, MoreOutlined, KeyOutlined } from "@ant-design/icons";
import { supabaseClient } from "../lib/supabase";
import { BRAND } from "../theme";

const { useBreakpoint } = Grid;

const TABS = [
  { key: "/corporate", label: "Dashboard" },
  { key: "/corporate/orders", label: "Orders" },
  { key: "/corporate/appointments", label: "Appointments" },
  { key: "/corporate/home-collection", label: "Home" },
  { key: "/corporate/book", label: "Book" },
];

// Corporate shell: teal top bar with the corporate's name, a slim tab nav
// (Dashboard / Orders / Book), change-password and logout. Mobile-first.
export function CorporateLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [corpName, setCorpName] = useState<string>("");
  const [pwOpen, setPwOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pwForm] = Form.useForm();

  useEffect(() => {
    // RLS lets a corporate user read exactly their own corporate row.
    supabaseClient.from("corporates").select("name").limit(1).maybeSingle()
      .then(({ data }) => setCorpName((data?.name as string) ?? ""));
  }, []);

  const active = TABS.filter((t) => location.pathname === t.key ||
    (t.key !== "/corporate" && location.pathname.startsWith(`${t.key}`)))
    .sort((a, b) => b.key.length - a.key.length)[0]?.key ?? "/corporate";

  async function logout() {
    await supabaseClient.auth.signOut();
    navigate("/corporate/login", { replace: true });
  }

  async function changePassword() {
    const v = await pwForm.validateFields();
    setBusy(true);
    const { error } = await supabaseClient.auth.updateUser({ password: v.password });
    setBusy(false);
    if (error) { message.error(error.message); return; }
    message.success("Password updated");
    setPwOpen(false); pwForm.resetFields();
  }

  return (
    <Layout style={{ minHeight: "100dvh", background: BRAND.bgLayout }}>
      <Layout.Header
        style={{
          position: "sticky", top: 0, zIndex: 10, height: 56, lineHeight: "56px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#fff", padding: `0 ${isMobile ? 12 : 24}px`,
          borderBottom: `1px solid ${BRAND.border}`, gap: 8,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <BankOutlined style={{ color: BRAND.primary, fontSize: 18 }} />
          <Typography.Text strong ellipsis style={{ fontSize: 15, maxWidth: isMobile ? 140 : 320 }}>
            {corpName || "Corporate Portal"}
          </Typography.Text>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {!isMobile && TABS.map((t) => (
            <Link key={t.key} to={t.key}>
              <Button type={active === t.key ? "primary" : "text"} size="middle">{t.label}</Button>
            </Link>
          ))}
          <Dropdown
            menu={{
              items: [
                { key: "pw", icon: <KeyOutlined />, label: "Change password", onClick: () => setPwOpen(true) },
                { key: "out", icon: <LogoutOutlined />, label: "Log out", onClick: logout },
              ],
            }}
          >
            <Button type="text" icon={<MoreOutlined />} aria-label="Account menu" />
          </Dropdown>
        </span>
      </Layout.Header>

      {isMobile && (
        <div style={{
          position: "sticky", top: 56, zIndex: 9, display: "flex", background: "#fff",
          borderBottom: `1px solid ${BRAND.border}`,
        }}>
          {TABS.map((t) => (
            <Link key={t.key} to={t.key} style={{ flex: 1 }}>
              <div style={{
                textAlign: "center", padding: "10px 0", fontSize: 14,
                fontWeight: active === t.key ? 600 : 400,
                color: active === t.key ? BRAND.primary : "#4B5563",
                borderBottom: active === t.key ? `2px solid ${BRAND.primary}` : "2px solid transparent",
              }}>
                {t.label}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Layout.Content
        style={{
          width: "100%", maxWidth: 1100, margin: "0 auto",
          padding: isMobile ? "12px 12px calc(24px + env(safe-area-inset-bottom))" : "24px 24px 48px",
        }}
      >
        <Outlet />
      </Layout.Content>

      <Modal title="Change password" open={pwOpen} onCancel={() => setPwOpen(false)}
        onOk={changePassword} okText="Update" confirmLoading={busy}>
        <Form form={pwForm} layout="vertical">
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 8, message: "At least 8 characters" }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
