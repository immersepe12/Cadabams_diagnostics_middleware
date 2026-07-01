import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Spin } from "antd";
import type { Session } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabase";

// Gate for the /portal/* subtree. Checks the Supabase session directly (not via
// Refine's authProvider, which stays staff-only) and requires a PATIENT session:
// a phone identity that is NOT staff. Staff are bounced to the ops app.
type Gate = "loading" | "patient" | "staff" | "anon";

function classify(session: Session | null): Gate {
  if (!session?.user) return "anon";
  const isStaff = (session.user.app_metadata as { role?: string })?.role === "staff";
  if (isStaff) return "staff";
  return session.user.phone ? "patient" : "anon";
}

export function PortalAuthenticated({ children }: { children: React.ReactNode }) {
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
  if (gate === "anon") return <Navigate to="/portal/login" replace />;
  return <>{children}</>;
}
