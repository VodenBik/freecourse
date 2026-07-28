"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/providers";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { translate } = useLocale();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function completeAuth() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError(translate("authCallbackNoConfig"));
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          if (!cancelled) setError(exchangeError.message);
          return;
        }
      }

      if (accessToken && refreshToken) {
        const { error: tokenError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (tokenError) {
          if (!cancelled) setError(tokenError.message);
          return;
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        if (!cancelled) setError(sessionError.message);
        return;
      }

      if (data.session) {
        router.replace("/dashboard");
        return;
      }

      if (!cancelled) {
        setError(translate("authCallbackNoSession"));
      }
    }

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [router, translate]);

  return (
    <main className="auth-page">
      <section className="auth-shell auth-shell--compact">
        <p className="eyebrow">{translate("schoolName")}</p>
        <h1>{translate("authCallbackTitle")}</h1>
        <p>{error || translate("authCallbackDescription")}</p>
        {error ? (
          <Link className="button button--primary" href="/login">
            {translate("goToLogin")}
          </Link>
        ) : null}
      </section>
    </main>
  );
}
