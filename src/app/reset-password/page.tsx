"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { useLocale } from "@/components/providers";
import { getSupabaseBrowserClient } from "@/lib/supabase";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export default function ResetPasswordPage() {
  const { translate } = useLocale();
  const [checking, setChecking] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function prepareRecoverySession() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const accessToken = hashParams.get("access_token") ?? params.get("access_token");
      const refreshToken = hashParams.get("refresh_token") ?? params.get("refresh_token");
      const linkError = hashParams.get("error_description") ?? params.get("error_description");
      const isRecoveryLink = Boolean(code || accessToken || hashParams.get("type") === "recovery");

      if (linkError) {
        if (!cancelled) {
          setError(linkError);
          setRecoveryMode(true);
          setChecking(false);
        }
        return;
      }

      if (!isRecoveryLink) {
        if (!cancelled) setChecking(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setError(translate("authCallbackNoConfig"));
          setRecoveryMode(true);
          setChecking(false);
        }
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
        }

        const { data, error: getSessionError } = await supabase.auth.getSession();
        if (getSessionError) throw getSessionError;
        if (!data.session) throw new Error(translate("resetLinkInvalid"));

        window.history.replaceState({}, document.title, "/reset-password");
        if (!cancelled) {
          setRecoveryMode(true);
          setError("");
        }
      } catch (sessionError) {
        if (!cancelled) {
          setRecoveryMode(true);
          setError(errorMessage(sessionError, translate("resetLinkInvalid")));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void prepareRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [translate]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const passwordRepeat = String(formData.get("passwordRepeat") ?? "");

    if (password.length < 8) {
      setError(translate("passwordMinLength"));
      return;
    }

    if (password !== passwordRepeat) {
      setError(translate("passwordMismatch"));
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(translate("authCallbackNoConfig"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(errorMessage(updateError, translate("saveFailed")));
      return;
    }

    await supabase.auth.signOut();
    setMessage(translate("passwordUpdated"));
    form.reset();
  }

  if (checking) {
    return (
      <main className="form-page">
        <section className="form-card">
          <h1 style={{ fontSize: 34 }}>{translate("resetTitle")}</h1>
          <p>{translate("loading")}</p>
        </section>
      </main>
    );
  }

  if (!recoveryMode) {
    return <AuthForm mode="reset" />;
  }

  return (
    <main className="form-page">
      <section className="form-card">
        <h1 style={{ fontSize: 34 }}>{translate("newPasswordTitle")}</h1>
        <p>{translate("newPasswordDescription")}</p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            {translate("newPassword")}
            <input
              minLength={8}
              name="password"
              placeholder={translate("newPasswordPlaceholder")}
              required
              type="password"
            />
          </label>
          <label>
            {translate("passwordRepeat")}
            <input
              minLength={8}
              name="passwordRepeat"
              placeholder={translate("passwordRepeatPlaceholder")}
              required
              type="password"
            />
          </label>

          {error ? <div className="error">{error}</div> : null}
          {message ? <div className="success">{message}</div> : null}

          <button className="button" disabled={loading || Boolean(message)} type="submit">
            {loading ? translate("pleaseWait") : translate("saveNewPassword")}
          </button>
        </form>

        <div className="action-row">
          <Link href="/login">{translate("goToLogin")}</Link>
        </div>
      </section>
    </main>
  );
}
