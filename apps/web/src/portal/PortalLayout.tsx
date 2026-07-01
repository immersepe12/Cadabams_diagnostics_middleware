import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Layout, Button, Space, Typography } from "antd";
import { LogoutOutlined, ExperimentOutlined } from "@ant-design/icons";
import { supabaseClient } from "../lib/supabase";

// Slim patient shell — no ops sidebar. Header with brand, the patient's number,
// and logout.
export function PortalLayout() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState<string>("");

  useEffect(() => {
    supabaseClient.auth.getUser().then(({ data }) => setPhone(data.user?.phone ?? ""));
  }, []);

  async function logout() {
    await supabaseClient.auth.signOut();
    navigate("/portal/login", { replace: true });
  }

  return (
    <Layout style={{ minHeight: "100vh", background: "#f5f5f5" }}>
      <Layout.Header
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "#fff", padding: "0 24px", height: 56, borderBottom: "1px solid #f0f0f0",
        }}
      >
        <Space>
          <ExperimentOutlined style={{ color: "#1677ff" }} />
          <Typography.Text strong>Cadabams Diagnostics</Typography.Text>
          <Typography.Text type="secondary">· My Reports</Typography.Text>
        </Space>
        <Space>
          {phone && <Typography.Text type="secondary">{phone}</Typography.Text>}
          <Button size="small" icon={<LogoutOutlined />} onClick={logout}>Logout</Button>
        </Space>
      </Layout.Header>
      <Layout.Content style={{ maxWidth: 960, width: "100%", margin: "0 auto", padding: 24 }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
