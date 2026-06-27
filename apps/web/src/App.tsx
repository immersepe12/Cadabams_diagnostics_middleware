import { Refine } from "@refinedev/core";
import { dataProvider, liveProvider } from "@refinedev/supabase";
import { ThemedLayoutV2, ErrorComponent, notificationProvider } from "@refinedev/antd";
import routerProvider, {
  UnsavedChangesNotifier,
  DocumentTitleHandler,
} from "@refinedev/react-router-v6";
import { BrowserRouter, Routes, Route, Outlet, Navigate } from "react-router-dom";
import {
  UserOutlined,
  FileTextOutlined,
  ExperimentOutlined,
} from "@ant-design/icons";
import { App as AntApp } from "antd";
import "@refinedev/antd/dist/reset.css";

import { supabaseClient } from "./lib/supabase";
import { PatientList } from "./pages/patients/list";
import { PatientShow } from "./pages/patients/show";
import { BillList } from "./pages/bills/list";
import { BillShow } from "./pages/bills/show";
import { TestList } from "./pages/tests/list";

export default function App() {
  return (
    <BrowserRouter>
      <AntApp>
        <Refine
          dataProvider={dataProvider(supabaseClient)}
          liveProvider={liveProvider(supabaseClient)}
          routerProvider={routerProvider}
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
          ]}
          options={{ syncWithLocation: true, liveMode: "auto" }}
        >
          <Routes>
            <Route
              element={
                <ThemedLayoutV2
                  Title={({ collapsed }) => (
                    <span style={{ fontWeight: 700, fontSize: collapsed ? 14 : 16, whiteSpace: "nowrap" }}>
                      {collapsed ? "CD" : "Cadabams Ops"}
                    </span>
                  )}
                >
                  <Outlet />
                </ThemedLayoutV2>
              }
            >
              <Route index element={<Navigate to="/bills" />} />
              <Route path="/patients" element={<PatientList />} />
              <Route path="/patients/:mobile" element={<PatientShow />} />
              <Route path="/bills" element={<BillList />} />
              <Route path="/bills/:id" element={<BillShow />} />
              <Route path="/tests" element={<TestList />} />
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
