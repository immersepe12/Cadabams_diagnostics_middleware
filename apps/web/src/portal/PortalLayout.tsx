import { Outlet, useNavigate } from "react-router-dom";
import { Layout, Button, Grid, Typography } from "antd";
import { LogoutOutlined, ExperimentOutlined } from "@ant-design/icons";
import { supabaseClient } from "../lib/supabase";
import { BRAND } from "../theme";

const { useBreakpoint } = Grid;

// Slim patient shell — no ops sidebar. Mobile-first: sticky header, full-bleed
// content on phones, comfortable centered column on larger screens.
export function PortalLayout() {
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const isMobile = !screens.md;

  async function logout() {
    await supabaseClient.auth.signOut();
    navigate("/portal/login", { replace: true });
  }

  return (
    <Layout style={{ minHeight: "100dvh", background: BRAND.bgLayout }}>
      <Layout.Header
        style={{
          position: "sticky", top: 0, zIndex: 10, height: 56, lineHeight: "56px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#fff", padding: `0 ${isMobile ? 16 : 24}px`,
          borderBottom: `1px solid ${BRAND.border}`,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <ExperimentOutlined style={{ color: BRAND.primary, fontSize: 18 }} />
          <Typography.Text strong style={{ fontSize: 16 }}>My Reports</Typography.Text>
        </span>
        <Button
          icon={<LogoutOutlined />}
          onClick={logout}
          shape={isMobile ? "circle" : "default"}
          aria-label="Log out"
        >
          {isMobile ? null : "Logout"}
        </Button>
      </Layout.Header>
      <Layout.Content
        style={{
          width: "100%", maxWidth: 760, margin: "0 auto",
          padding: isMobile
            ? "12px 12px calc(24px + env(safe-area-inset-bottom))"
            : "24px 24px 48px",
        }}
      >
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
