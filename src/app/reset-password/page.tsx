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
  const [passwordSetupUserId, setPasswordSetupUserId] = useState<string | null>(null);
  const [passwordSetupAttempted, setPasswordSetupAttempted] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function preparePasswordSetupSession() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const code = params.get("code");
      const accessToken = hashParams.get("access_token") ?? params.get("access_token");
      const refreshToken = hashParams.get("refresh_token") ?? params.get("refresh_token");
      const linkError = hashParams.get("error_description") ?? params.get("error_description");
      const linkType = hashParams.get("type") ?? params.get("type");
      const supportedLinkType = linkType === "recovery" || linkType === "invite";
      const isPasswordSetupLink = Boolean(code || (accessToken && refreshToken)) &&
        (!linkType || supportedLinkType);

      if (linkError || (linkType && !supportedLinkType)) {
        if (!cancelled) {
          setError(translate("resetPasswordSetupLinkInvalid"));
          setPasswordSetupAttempted(true);
          setChecking(false);
        }
        return;
      }

      if (!isPasswordSetupLink) {
        if (!cancelled) setChecking(false);
        return;
      }

      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        if (!cancelled) {
          setError(translate("authCallbackNoConfig"));
          setPasswordSetupAttempted(true);
          setChecking(false);
        }
        return;
      }

      try {
        let expectedUserId: string | undefined;
        if (code) {
          const exchangeResult = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeResult.error) throw exchangeResult.error;
          expectedUserId = exchangeResult.data.user?.id ?? exchangeResult.data.session?.user.id;
        } else if (accessToken && refreshToken) {
          const sessionResult = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionResult.error) throw sessionResult.error;
          expectedUserId = sessionResult.data.user?.id ?? sessionResult.data.session?.user.id;
        }

        if (!expectedUserId) throw new Error(translate("resetPasswordSetupLinkInvalid"));

        const { data: userData, error: getUserError } = await supabase.auth.getUser();
        if (getUserError || userData.user?.id !== expectedUserId) {
          throw new Error(translate("resetPasswordSetupLinkInvalid"));
        }

        window.history.replaceState({}, document.title, "/reset-password");
        if (!cancelled) {
          setPasswordSetupUserId(expectedUserId);
          setError("");
        }
      } catch {
        if (!cancelled) {
          setPasswordSetupAttempted(true);
          setError(translate("resetPasswordSetupLinkInvalid"));
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void preparePasswordSetupSession();

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
    if (!supabase || !passwordSetupUserId) {
      setError(translate("authCallbackNoConfig"));
      return;
    }

    setLoading(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || userData.user?.id !== passwordSetupUserId) {
      await supabase.auth.signOut();
      setLoading(false);
      setPasswordSetupUserId(null);
      setPasswordSetupAttempted(true);
      setError(translate("resetPasswordSetupLinkInvalid"));
      return;
    }

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

  if (!passwordSetupUserId && !passwordSetupAttempted) {
    return <AuthForm mode="reset" />;
  }

  if (!passwordSetupUserId) {
    return (
      <main className="form-page">
        <section className="form-card">
          <h1 style={{ fontSize: 34 }}>{translate("newPasswordTitle")}</h1>
          <p className="error">{error || translate("resetPasswordSetupLinkInvalid")}</p>
          <div className="action-row">
            <Link href="/login">{translate("goToLogin")}</Link>
          </div>
        </section>
      </main>
    );
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
