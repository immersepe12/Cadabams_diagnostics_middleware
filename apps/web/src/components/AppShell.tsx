import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGetIdentity, useLogout } from "@refinedev/core";
import { Layout, Menu, Grid, Button, Drawer, Typography, Avatar, Tooltip } from "antd";
import {
  FileTextOutlined, UserOutlined, ExperimentOutlined, ScanOutlined,
  MenuOutlined, LogoutOutlined, BankOutlined, CalendarOutlined, HomeOutlined,
} from "@ant-design/icons";
import { BRAND } from "../theme";

const { useBreakpoint } = Grid;

// Custom ops shell (replaces Refine's ThemedLayoutV2, whose mobile menu trigger
// floated outside the header). Desktop: light sticky sidebar with a teal active
// pill. Mobile: a proper 56px top bar with the hamburger INSIDE it → nav drawer.

const NAV = [
  { key: "/bills", icon: <FileTextOutlined />, label: "Bills" },
  { key: "/appointments", icon: <CalendarOutlined />, label: "Appointments" },
  { key: "/home-collection", icon: <HomeOutlined />, label: "Home Collection" },
  { key: "/patients", icon: <UserOutlined />, label: "Patients" },
  { key: "/tests", icon: <ExperimentOutlined />, label: "Tests" },
  {
    key: "radiology", icon: <ScanOutlined />, label: "Radiology",
    children: [
      { key: "/radiology", label: "All scans" },
      { key: "/radiology/us", label: "Ultrasound" },
      { key: "/radiology/ct-mri", label: "CT & MRI" },
      { key: "/radiology/xray", label: "X-Ray" },
    ],
  },
];

// Admin-only section (user & corporate management).
const ADMIN_NAV = [{ key: "/corporates", icon: <BankOutlined />, label: "Corporates" }];

const NAV_KEYS = ["/bills", "/appointments", "/home-collection", "/patients", "/tests", "/radiology/us", "/radiology/ct-mri", "/radiology/xray", "/radiology", "/corporates"];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? 0 : "18px 16px 14px" }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, background: BRAND.primarySoft, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <ExperimentOutlined style={{ color: BRAND.primary, fontSize: 17 }} />
      </div>
      <div style={{ lineHeight: 1.15 }}>
        <Typography.Text strong style={{ fontSize: 15, display: "block" }}>Cadabams</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>Diagnostics Ops</Typography.Text>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user } = useGetIdentity<{ name?: string; role?: string | null }>();
  const { mutate: logout } = useLogout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const navItems = user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

  // Longest nav key that prefixes the current path → selected item
  // (e.g. /bills/123 → /bills, /radiology/ct-mri → itself, not /radiology).
  const selectedKey = useMemo(
    () => NAV_KEYS.filter((k) => location.pathname === k || location.pathname.startsWith(`${k}/`))
      .sort((a, b) => b.length - a.length)[0] ?? location.pathname,
    [location.pathname],
  );

  const menu = (
    <Menu
      mode="inline"
      items={navItems}
      selectedKeys={[selectedKey]}
      defaultOpenKeys={["radiology"]}
      style={{ border: "none", background: "transparent", flex: 1 }}
      onClick={({ key }) => {
        if (String(key).startsWith("/")) {
          navigate(String(key));
          setDrawerOpen(false);
        }
      }}
    />
  );

  const userBlock = (
    <div style={{
      borderTop: `1px solid ${BRAND.border}`, padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Avatar size={28} style={{ background: BRAND.primary, fontSize: 13, flexShrink: 0 }}>
          {(user?.name ?? "O").slice(0, 1).toUpperCase()}
        </Avatar>
        <Typography.Text type="secondary" ellipsis style={{ fontSize: 12.5, maxWidth: 130 }}>
          {user?.name ?? "Ops"}
        </Typography.Text>
      </div>
      <Tooltip title="Log out">
        <Button type="text" size="small" icon={<LogoutOutlined />} onClick={() => logout()} aria-label="Log out" />
      </Tooltip>
    </div>
  );

  if (isMobile) {
    return (
      <Layout style={{ minHeight: "100dvh" }}>
        <Layout.Header style={{
          position: "sticky", top: 0, zIndex: 20, height: 56, lineHeight: "56px",
          background: "#fff", borderBottom: `1px solid ${BRAND.border}`,
          display: "flex", alignItems: "center", gap: 4, padding: "0 8px 0 4px",
        }}>
          <Button type="text" icon={<MenuOutlined style={{ fontSize: 18 }} />}
            onClick={() => setDrawerOpen(true)} aria-label="Open menu"
            style={{ width: 44, height: 44 }} />
          <Brand compact />
        </Layout.Header>

        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={280}
          styles={{ body: { padding: 0, display: "flex", flexDirection: "column" }, header: { display: "none" } }}
        >
          <Brand />
          {menu}
          {userBlock}
        </Drawer>

        <Layout.Content style={{ padding: "12px 12px calc(24px + env(safe-area-inset-bottom))" }}>
          {children}
        </Layout.Content>
      </Layout>
    );
  }

  return (
    <Layout hasSider style={{ minHeight: "100vh" }}>
      <Layout.Sider
        width={240}
        theme="light"
        style={{
          position: "sticky", top: 0, height: "100vh",
          borderRight: `1px solid ${BRAND.border}`,
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Brand />
          {menu}
          {userBlock}
        </div>
      </Layout.Sider>
      <Layout>
        <Layout.Content style={{ padding: 24, maxWidth: 1440, width: "100%", margin: "0 auto" }}>
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
