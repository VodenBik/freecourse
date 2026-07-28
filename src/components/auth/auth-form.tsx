"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth, useLocale } from "@/components/providers";

type AuthMode = "login" | "register" | "reset";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { signIn, signUp, resetPassword } = useAuth();
  const { translate } = useLocale();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const passwordRepeat = String(formData.get("passwordRepeat") ?? "");
    const fullName = String(formData.get("fullName") ?? "");
    const phone = String(formData.get("phone") ?? "");

    if (mode === "register" && password !== passwordRepeat) {
      setError(translate("passwordMismatch"));
      return;
    }

    setLoading(true);
    const result: { error?: string; message?: string } =
      mode === "login"
        ? await signIn(email, password)
        : mode === "register"
          ? await signUp({ fullName, email, password, phone })
          : await resetPassword(email);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }

    if (mode === "reset" || mode === "register") {
      setMessage(result.message ?? translate("ready"));
      event.currentTarget.reset();
      return;
    }

    router.replace("/dashboard");
  }

  const title =
    mode === "login"
      ? translate("loginTitle")
      : mode === "register"
        ? translate("registerTitle")
        : translate("resetTitle");

  return (
    <main className="form-page">
      <section className="form-card">
        <h1 style={{ fontSize: 34 }}>{title}</h1>
        <p>
          {mode === "login"
            ? translate("loginDescription")
            : mode === "register"
              ? translate("registerDescription")
              : translate("resetDescription")}
        </p>

        <form className="form-grid" onSubmit={handleSubmit}>
          {mode === "register" ? (
            <label>
              {translate("fullName")}
              <input name="fullName" required placeholder={translate("fullNamePlaceholder")} />
            </label>
          ) : null}
          <label>
            {translate("email")}
            <input name="email" type="email" required placeholder={translate("emailPlaceholder")} />
          </label>
          {mode === "register" ? (
            <label>
              {translate("phone")}
              <input name="phone" type="tel" placeholder={translate("phonePlaceholder")} />
            </label>
          ) : null}
          {mode !== "reset" ? (
            <label>
              {translate("password")}
              <input
                name="password"
                type="password"
                required
                placeholder={translate("passwordPlaceholder")}
              />
            </label>
          ) : null}
          {mode === "register" ? (
            <label>
              {translate("passwordRepeat")}
              <input
                name="passwordRepeat"
                type="password"
                required
                placeholder={translate("passwordRepeatPlaceholder")}
              />
            </label>
          ) : null}

          {error ? <div className="error">{error}</div> : null}
          {message ? <div className="success">{message}</div> : null}

          <button className="button" disabled={loading} type="submit">
            {loading
              ? translate("pleaseWait")
              : mode === "login"
                ? translate("signInButton")
                : mode === "register"
                  ? translate("createAccount")
                  : translate("send")}
          </button>
        </form>

        <div className="action-row">
          {mode !== "login" ? <Link href="/login">{translate("alreadyHaveAccount")}</Link> : null}
          {mode !== "register" ? <Link href="/register">{translate("registration")}</Link> : null}
          {mode !== "reset" ? <Link href="/reset-password">{translate("forgotPassword")}</Link> : null}
        </div>
      </section>
    </main>
  );
}
