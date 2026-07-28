import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "@/app/globals.css";
import { AppProviders } from "@/components/providers";
import { TopNav } from "@/components/nav";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "FreeCourse — Open-source LMS",
  description:
    "A free and open-source learning management system for creating courses, publishing lessons, assigning homework, reviewing submissions, and managing students.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={inter.variable} lang="en">
      <body>
        <AppProviders>
          <TopNav />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
