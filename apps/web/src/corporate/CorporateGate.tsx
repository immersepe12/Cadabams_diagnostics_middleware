import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

// Gate for the /corporate/* subtree: requires a corporate-role session.
// Staff/admin → ops app; patients → patient portal; anonymous → corporate login.
type Gate = "loading" | "corporate" | "staff" | "patient" | "anon";

function classify(session: Session | null): Gate {
  if (!session?.user) return "anon";
  const role = (session.user.app_metadata as { role?: string })?.role;
  if (role === "corporate") return "corporate";
  if (role === "staff" || role === "admin") return "staff";
  return session.user.phone ? "patient" : "anon";
}

export function CorporateGate({ children }: { children: React.ReactNode }) {
  const [gate, setGate] = useState<Gate>("loading");

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => setGate(classify(data.session)));
    const { data: sub } = supabaseClient.auth.onAuthStateChange((_e, session) =>
      setGate(classify(session)),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  if (gate === "loading") {
    return <div style={{ display: "grid", placeItems: "center", height: "60vh" }}><Spin /></div>;
  }
  if (gate === "staff") return <Navigate to="/bills" replace />;
  if (gate === "patient") return <Navigate to="/portal" replace />;
  if (gate === "anon") return <Navigate to="/corporate/login" replace />;
  return <>{children}</>;
}
