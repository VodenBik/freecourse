import type { Locale, SubmissionStatus } from "@/types/domain";

export function submissionLabel(status: SubmissionStatus, locale: Locale = "en") {
  const labels: Record<SubmissionStatus, Record<Locale, string>> = {
    not_submitted: { en: "Not submitted", ru: "Не отправлено" },
    submitted: { en: "Submitted", ru: "Отправлено" },
    in_review: { en: "In review", ru: "На проверке" },
    accepted: { en: "Reviewed", ru: "Проверено" },
    needs_revision: { en: "Needs revision", ru: "Нужно доработать" },
    overdue: { en: "Overdue", ru: "Просрочено" },
  };
  return labels[status][locale];
}

export function submissionTone(status: SubmissionStatus) {
  if (status === "accepted") return "ok";
  if (status === "needs_revision" || status === "overdue") return "danger";
  if (status === "submitted" || status === "in_review") return "warn";
  return "gray";
}

export function roleLabel(role: string, locale: Locale = "en") {
  const labels: Record<string, Record<Locale, string>> = {
    admin: { en: "Administrator", ru: "Администратор" },
    curator: { en: "Coordinator", ru: "Координатор" },
    teacher: { en: "Teacher", ru: "Преподаватель" },
    student: { en: "Student", ru: "Ученик" },
  };
  return labels[role]?.[locale] ?? role;
}

export function accessModeLabel(mode: string, locale: Locale = "en") {
  const labels: Record<string, Record<Locale, string>> = {
    all_open: { en: "All lessons open", ru: "Все уроки открыты" },
    gradual: { en: "Open gradually", ru: "Открываются постепенно" },
    after_submission: {
      en: "After homework submission",
      ru: "После сдачи задания",
    },
    after_review: {
      en: "After homework review",
      ru: "После проверки задания",
    },
    manual: { en: "Opened manually", ru: "Открываются вручную" },
    time_limited: { en: "Time limited", ru: "Ограничены по времени" },
  };
  return labels[mode]?.[locale] ?? mode;
}
