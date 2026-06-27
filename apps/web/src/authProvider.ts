import type { AuthProvider } from "@refinedev/core";
import { supabaseClient } from "./lib/supabase";

export const authProvider: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      return { success: false, error: { name: "LoginError", message: error.message } };
    }
    return { success: true, redirectTo: "/orders" };
  },

  logout: async () => {
    await supabaseClient.auth.signOut();
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) return { authenticated: true };
    return { authenticated: false, redirectTo: "/login" };
  },

  getIdentity: async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return null;
    return { id: user.id, name: user.email ?? "User" };
  },

  onError: async (error) => {
    if (error?.status === 401 || error?.code === "PGRST301") {
      return { logout: true, redirectTo: "/login" };
    }
    return { error };
  },
};
