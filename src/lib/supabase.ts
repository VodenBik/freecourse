import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getSupabaseBrowserClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }

  return browserClient;
}

export function getAuthRedirectUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/auth/callback` : undefined;
}

export function getPasswordResetRedirectUrl() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/reset-password`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/reset-password` : undefined;
}
