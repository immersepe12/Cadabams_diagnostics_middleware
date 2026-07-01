import { Refine, Authenticated, useLogout, useGetIdentity } from "@refinedev/core";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { ThemedLayoutV2, ErrorComponent, notificationProvider, AuthPage } from "@refinedev/antd";
import routerProvider, {
  UnsavedChangesNotifier,
  DocumentTitleHandler,
  CatchAllNavigate,
} from "@refinedev/react-router-v6";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import {
  UserOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  ScanOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { App as AntApp, Button, Layout, Space, Spin, Typography } from "antd";
import "@refinedev/antd/dist/reset.css";
import { useEffect, useState } from "react";

import { supabaseClient } from "./lib/supabase";
import { authProvider } from "./authProvider";
import { PatientList } from "./pages/patients/list";
import { PatientShow } from "./pages/patients/show";
import { BillList } from "./pages/bills/list";
import { BillShow } from "./pages/bills/show";
import { TestList } from "./pages/tests/list";
import { RadiologyList } from "./pages/radiology/list";
import { BookingNew } from "./pages/bookings/new";
import { PortalAuthenticated } from "./portal/PortalAuthenticated";
import { PortalLayout } from "./portal/PortalLayout";
import { PortalLogin } from "./portal/login";
import { ReportHub } from "./portal/pages/ReportHub";
import { ReportDetail } from "./portal/pages/ReportDetail";

// Inside the ops <Authenticated> group a session is guaranteed, but a phone-authed
// patient would also pass it. Assert the staff role and bounce patients to /portal.
function RequireStaff({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "staff" | "not-staff">("loading");
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      const role = (data.session?.user.app_metadata as { role?: string })?.role;
      setState(role === "staff" ? "staff" : "not-staff");
    });
  }, []);
  if (state === "loading") return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><Spin /></div>;
  if (state === "not-staff") return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

function AppHeader() {
  const { mutate: logout } = useLogout();
  const { data: user } = useGetIdentity<{ name?: string }>();
  return (
    <Layout.Header style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, background: "#fff", padding: "0 24px", height: 56, borderBottom: "1px solid #f0f0f0" }}>
      <Space>
        <UserOutlined style={{ color: "#888" }} />
        <Typography.Text type="secondary">{user?.name ?? "Ops"}</Typography.Text>
        <Button size="small" icon={<LogoutOutlined />} onClick={() => logout()}>Logout</Button>
      </Space>
    </Layout.Header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AntApp>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          routerProvider={routerProvider}
          authProvider={authProvider}
          notificationProvider={notificationProvider}
          resources={[
            {
              name: "patients",
              list: "/patients",
              show: "/patients/:mobile",
              meta: { label: "Patients", icon: <UserOutlined /> },
            },
            {
              name: "bills",
              list: "/bills",
              show: "/bills/:id",
              meta: { label: "Bills", icon: <FileTextOutlined /> },
            },
            {
              name: "tests",
              list: "/tests",
              meta: { label: "Tests", icon: <ExperimentOutlined /> },
            },
            {
              name: "radiology",
              list: "/radiology",
              meta: { label: "Radiology", icon: <ScanOutlined /> },
            },
          ]}
          options={{ syncWithLocation: true, liveMode: "auto" }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="protected" fallback={<CatchAllNavigate to="/login" />}>
                  <RequireStaff>
                    <ThemedLayoutV2
                      Header={AppHeader}
                      Title={({ collapsed }) => (
                        <span style={{ fontWeight: 700, fontSize: collapsed ? 14 : 16, whiteSpace: "nowrap" }}>
                          {collapsed ? "CD" : "Cadabams Ops"}
                        </span>
                      )}
                    >
                      <Outlet />
                    </ThemedLayoutV2>
                  </RequireStaff>
                </Authenticated>
              }
            >
              <Route index element={<Navigate to="/bills" />} />
              <Route path="/patients" element={<PatientList />} />
              <Route path="/patients/:mobile" element={<PatientShow />} />
              <Route path="/bills" element={<BillList />} />
              <Route path="/bills/new" element={<BookingNew />} />
              <Route path="/bills/:id" element={<BillShow />} />
              <Route path="/tests" element={<TestList />} />
              <Route path="/radiology" element={<RadiologyList />} />
            </Route>

            <Route
              element={
                <Authenticated key="public" fallback={<Outlet />}>
                  <Navigate to="/bills" />
                </Authenticated>
              }
            >
              <Route
                path="/login"
                element={
                  <AuthPage
                    type="login"
                    title={<Typography.Title level={3} style={{ margin: 0 }}>Cadabams Ops</Typography.Title>}
                    registerLink={false}
                    forgotPasswordLink={false}
                  />
                }
              />
            </Route>

            {/* Patient portal — phone-OTP auth, its own slim layout, scoped by RLS */}
            <Route path="/portal/login" element={<PortalLogin />} />
            <Route
              path="/portal"
              element={
                <PortalAuthenticated>
                  <PortalLayout />
                </PortalAuthenticated>
              }
            >
              <Route index element={<ReportHub />} />
              <Route path="reports/:id" element={<ReportDetail />} />
            </Route>

            <Route path="*" element={<ErrorComponent />} />
          </Routes>
          <UnsavedChangesNotifier />
          <DocumentTitleHandler />
        </Refine>
      </AntApp>
    </BrowserRouter>
  );
}
