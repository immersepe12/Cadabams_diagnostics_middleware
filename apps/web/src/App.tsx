import { Refine, Authenticated } from "@refinedev/core";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { ErrorComponent, notificationProvider, AuthPage } from "@refinedev/antd";
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
} from "@ant-design/icons";
import { App as AntApp, ConfigProvider, Spin, Typography } from "antd";
import "@refinedev/antd/dist/reset.css";
import { useEffect, useState } from "react";

import { appTheme } from "./theme";
import { AppShell } from "./components/AppShell";

import { supabaseClient } from "./lib/supabase";
import { authProvider } from "./authProvider";
import { PatientList } from "./pages/patients/list";
import { PatientShow } from "./pages/patients/show";
import { BillList } from "./pages/bills/list";
import { BillShow } from "./pages/bills/show";
import { TestList } from "./pages/tests/list";
import { RadiologyList } from "./pages/radiology/list";
import { Worklist } from "./pages/radiology/worklist";
import { BookingNew } from "./pages/bookings/new";
import { CorporatesList } from "./pages/corporates/list";
import { CorporateShow } from "./pages/corporates/show";
import { OrganisationShow } from "./pages/corporates/organisation";
import { PortalAuthenticated } from "./portal/PortalAuthenticated";
import { PortalLayout } from "./portal/PortalLayout";
import { PortalLogin } from "./portal/login";
import { ReportHub } from "./portal/pages/ReportHub";
import { ReportDetail } from "./portal/pages/ReportDetail";
import { CorporateGate } from "./corporate/CorporateGate";
import { CorporateLayout } from "./corporate/CorporateLayout";
import { CorporateLogin } from "./corporate/login";
import { CorporateDashboard } from "./corporate/pages/Dashboard";
import { CorporateOrders } from "./corporate/pages/Orders";
import { CorporateOrderDetail } from "./corporate/pages/OrderDetail";
import { CorporateBook } from "./corporate/pages/Book";

// Inside the ops <Authenticated> group a session is guaranteed, but corporate
// and patient logins share the auth pool. Route each identity to its own app:
// staff/admin stay here, corporate → /corporate, patients → /portal.
function RequireStaff({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "staff" | "corporate" | "patient">("loading");
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      const role = (data.session?.user.app_metadata as { role?: string })?.role;
      if (role === "staff" || role === "admin") setState("staff");
      else if (role === "corporate") setState("corporate");
      else setState("patient");
    });
  }, []);
  if (state === "loading") return <div style={{ display: "grid", placeItems: "center", height: "100vh" }}><Spin /></div>;
  if (state === "corporate") return <Navigate to="/corporate" replace />;
  if (state === "patient") return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ConfigProvider theme={appTheme}>
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
            {
              name: "radiology_us",
              list: "/radiology/us",
              meta: { label: "Ultrasound", icon: <ScanOutlined />, parent: "radiology" },
            },
            {
              name: "radiology_ctmri",
              list: "/radiology/ct-mri",
              meta: { label: "CT & MRI", icon: <ScanOutlined />, parent: "radiology" },
            },
            {
              name: "radiology_xray",
              list: "/radiology/xray",
              meta: { label: "X-Ray", icon: <ScanOutlined />, parent: "radiology" },
            },
          ]}
          options={{ syncWithLocation: true, liveMode: "auto" }}
        >
          <Routes>
            <Route
              element={
                <Authenticated key="protected" fallback={<CatchAllNavigate to="/login" />}>
                  <RequireStaff>
                    <AppShell>
                      <Outlet />
                    </AppShell>
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
              <Route path="/radiology/us" element={<Worklist modality="us" title="Ultrasound" />} />
              <Route path="/radiology/ct-mri" element={<Worklist modality="ctmri" title="CT & MRI" />} />
              <Route path="/radiology/xray" element={<Worklist modality="xray" title="X-Ray" />} />
              <Route path="/corporates" element={<CorporatesList />} />
              <Route path="/corporates/org" element={<OrganisationShow />} />
              <Route path="/corporates/:id" element={<CorporateShow />} />
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

            {/* Corporate portal — email/password, org-scoped by RLS */}
            <Route path="/corporate/login" element={<CorporateLogin />} />
            <Route
              path="/corporate"
              element={
                <CorporateGate>
                  <CorporateLayout />
                </CorporateGate>
              }
            >
              <Route index element={<CorporateDashboard />} />
              <Route path="orders" element={<CorporateOrders />} />
              <Route path="orders/:id" element={<CorporateOrderDetail />} />
              <Route path="book" element={<CorporateBook />} />
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
      </ConfigProvider>
    </BrowserRouter>
  );
}
