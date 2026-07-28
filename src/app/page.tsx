"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, ClipboardCheck, FileText, GraduationCap } from "lucide-react";
import { useLocale, useSchoolData } from "@/components/providers";
import { FreeCourseWordmark } from "@/components/freecourse-wordmark";

export default function HomePage() {
  const { translate } = useLocale();
  const { schoolSettings } = useSchoolData();

  return (
    <main className="hero">
      <section>
        <h1 className="hero-title">
          <FreeCourseWordmark ariaLabel={translate("wordmarkLabel")} />
        </h1>
        <p className="hero-copy">{schoolSettings.description || translate("landingDescription")}</p>
        <div className="action-row">
          <Link className="button" href="/register">
            {translate("registration")} <ArrowRight size={18} />
          </Link>
          <Link className="secondary-button" href="/login">
            {translate("login")}
          </Link>
        </div>
      </section>

      <aside className="visual-panel" aria-label={translate("dashboard")}>
        <div className="visual-panel-header">
          <strong>{translate("platformFeatures")}</strong>
        </div>
        <div className="visual-panel-body">
          <div className="lesson-strip">
            <span>
              <BookOpen size={18} /> {translate("coursesAndLessons")}
            </span>
          </div>
          <div className="lesson-strip">
            <span>
              <FileText size={18} /> {translate("learningMaterials")}
            </span>
          </div>
          <div className="lesson-strip">
            <span>
              <GraduationCap size={18} /> {translate("homework")}
            </span>
          </div>
          <div className="lesson-strip">
            <span>
              <ClipboardCheck size={18} /> {translate("workReview")}
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}
