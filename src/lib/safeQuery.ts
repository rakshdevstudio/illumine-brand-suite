import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

type QueryResult<T> = {
  data: T | null;
  error: any;
};

const LOGIN_ROUTES = ["/admin/login", "/vendor/login", "/school/login", "/pos/login"];

const isLoginRoute = (path: string) => LOGIN_ROUTES.some((route) => path.startsWith(route));

const getLoginPathForCurrentRoute = (path: string): string => {
  if (path.startsWith("/vendor")) return "/vendor/login";
  if (path.startsWith("/school")) return "/school/login";
  if (path.startsWith("/pos")) return "/pos/login";
  if (path.startsWith("/branch")) return "/admin/login";
  return "/admin/login";
};

export const isAuthError = (error: any): boolean => {
  if (!error) return false;

  const message = String(error.message || "").toLowerCase();
  const code = String(error.code || "").toUpperCase();
  const status = Number(error.status || 0);

  return (
    code === "PGRST301" ||
    code === "401" ||
    status === 401 ||
    status === 403 ||
    message.includes("jwt") ||
    message.includes("auth") ||
    message.includes("token") ||
    message.includes("session") ||
    message.includes("invalid claim") ||
    message.includes("row-level security")
  );
};

export const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname;
  if (isLoginRoute(currentPath)) return;
  const loginPath = getLoginPathForCurrentRoute(currentPath);
  window.location.href = loginPath;
};

const handleAuthFailure = async () => {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    redirectToLogin();
  }
};

export async function safeQuery<T>(
  queryFn: () => PromiseLike<QueryResult<T>>,
  pageName = "unknown",
): Promise<{ data: T | null }> {
  const { data, error } = await queryFn();

  if (error) {
    logger.error("Query failed", { scope: pageName, error });
    if (isAuthError(error)) {
      await handleAuthFailure();
      return { data: null };
    }
    throw error;
  }

  return { data: (data ?? null) as T | null };
}
