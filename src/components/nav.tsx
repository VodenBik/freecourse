"use client";

import Link from "next/link";
import Image from "next/image";
import { BookOpen, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { useAuth, useLocale } from "@/components/providers";
import { FreeCourseWordmark } from "@/components/freecourse-wordmark";
import { localeNames, locales } from "@/lib/i18n";

export function TopNav() {
  const { profile, signOut } = useAuth();
  const { locale, setLocale, translate } = useLocale();

  return (
    <header className="top-nav">
      <Link href="/" className="brand">
        <Image
          className="brand-logo"
          src="/logofc.svg"
          alt={translate("logoAlt")}
          width={42}
          height={42}
          loading="eager"
        />
        <FreeCourseWordmark ariaLabel={translate("wordmarkLabel")} />
      </Link>
      <nav>
        <div className="locale-switcher" aria-label={translate("language")}>
          {locales.map((item, index) => (
            <span key={item}>
              {index > 0 ? <span aria-hidden="true"> / </span> : null}
              <button
                aria-pressed={locale === item}
                className={locale === item ? "locale-option active" : "locale-option"}
                onClick={() => setLocale(item)}
                type="button"
              >
                {localeNames[item]}
              </button>
            </span>
          ))}
        </div>
        {profile ? (
          <>
            <Link href="/dashboard">
              <BookOpen size={18} />
              {translate("dashboard")}
            </Link>
            {profile.role !== "student" ? (
              <Link href="/admin">
                <Settings size={18} />
                {translate("admin")}
              </Link>
            ) : null}
            <button type="button" className="text-button" onClick={() => void signOut()}>
              <LogOut size={18} />
              {translate("logout")}
            </button>
          </>
        ) : (
          <>
            <Link href="/login">
              <LayoutDashboard size={18} />
              {translate("login")}
            </Link>
            <Link href="/register" className="nav-accent">
              {translate("registration")}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
