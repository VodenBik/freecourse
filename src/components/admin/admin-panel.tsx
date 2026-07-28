"use client";

import { FormEvent, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Download,
  ExternalLink,
  LockKeyhole,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth, useLocale, useSchoolData } from "@/components/providers";
import { isTestCourse, studentDisplayName } from "@/lib/school-api";
import { accessModeLabel, roleLabel, submissionLabel, submissionTone } from "@/lib/status";
import { t } from "@/lib/i18n";
import type {
  AccessMode,
  Assignment,
  AssignmentSubmission,
  Course,
  CourseLanguage,
  CourseModule,
  Lesson,
  LessonAccess,
  Locale,
  MaterialType,
  LessonMaterial,
  Profile,
  SchoolData,
  SchoolSettings,
  SubmissionStatus,
  UserRole,
} from "@/types/domain";

type AdminTab =
  | "users"
  | "courses"
  | "groups"
  | "submissions"
  | "access"
  | "stats"
  | "settings";

const tabs: Array<{ id: AdminTab; titleKey: string; icon: ReactNode }> = [
  { id: "users", titleKey: "users", icon: <Users size={18} /> },
  { id: "courses", titleKey: "courses", icon: <BookOpen size={18} /> },
  { id: "groups", titleKey: "groupsStreams", icon: <Users size={18} /> },
  { id: "submissions", titleKey: "reviews", icon: <ClipboardCheck size={18} /> },
  { id: "access", titleKey: "accesses", icon: <LockKeyhole size={18} /> },
  { id: "stats", titleKey: "statistics", icon: <BarChart3 size={18} /> },
  { id: "settings", titleKey: "settings", icon: <Settings size={18} /> },
];

const accessModes: AccessMode[] = [
  "all_open",
  "gradual",
  "after_submission",
  "after_review",
  "manual",
  "time_limited",
];

const materialTypes: MaterialType[] = ["video", "pdf", "docx", "text"];
const courseLanguages: CourseLanguage[] = ["en", "ru"];

function checkboxLabel(children: ReactNode) {
  return (
    <span className="checkbox-row">
      {children}
    </span>
  );
}

function toDateTimeLocalValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function materialTypeLabel(type: MaterialType, translate: (key: string) => string) {
  const labels: Record<MaterialType, string> = {
    video: translate("videoLink"),
    pdf: "PDF",
    docx: "DOCX",
    text: translate("textMaterial"),
  };
  return labels[type];
}

function fileAcceptForType(type: MaterialType) {
  if (type === "pdf") return ".pdf,application/pdf";
  if (type === "docx") {
    return ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return undefined;
}

function pluralizeLessons(count: number, locale: Locale) {
  if (locale === "en") {
    return `${count} ${t(count === 1 ? "lessonCountOne" : "lessonCountMany", locale)}`;
  }
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} ${t("lessonCountOne", locale)}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} ${t("lessonCountFew", locale)}`;
  }
  return `${count} ${t("lessonCountMany", locale)}`;
}

function useActionMessage(successKey = "saved") {
  const { translate } = useLocale();
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");

  async function run(action: () => Promise<void>) {
    setMessage("");
    try {
      await action();
      setTone("success");
      setMessage(translate(successKey));
      return true;
    } catch (error) {
      setTone("error");
      setMessage(error instanceof Error ? error.message : translate("saveFailed"));
      return false;
    }
  }

  return { message, run, tone };
}

function ActionMessage({ message, tone }: { message: string; tone: "success" | "error" }) {
  if (!message) return null;
  return <p className={tone === "success" ? "success" : "error"}>{message}</p>;
}

export function AdminPanel() {
  const { profile } = useAuth();
  const { locale, translate } = useLocale();
  const { dataError, dataLoading } = useSchoolData();
  const [activeTab, setActiveTab] = useState<AdminTab>("courses");
  const isTeacher = profile?.role === "teacher";
  const visibleTabs = isTeacher ? tabs.filter((tab) => tab.id === "courses") : tabs;
  const currentTab = visibleTabs.some((tab) => tab.id === activeTab) ? activeTab : "courses";

  return (
    <main className="page-shell">
      <div className="panel-title">
        <div className="brand-heading">
          <div>
            <p className="eyebrow">{translate("schoolManagement")}</p>
            <h1 style={{ fontSize: 44 }}>{translate("admin")}</h1>
            <p>
              {profile?.fullName} · {profile ? roleLabel(profile.role, locale) : ""}
            </p>
          </div>
        </div>
        {dataLoading ? <span>{translate("loading")}</span> : null}
      </div>

      {dataError ? <div className="empty-state">{dataError}</div> : null}

      <section className="admin-grid">
        <aside className="card">
          <div className="side-tabs">
            {visibleTabs.map((tab) => (
              <button
                className={tab.id === currentTab ? "active" : ""}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.icon}
                {translate(isTeacher && tab.id === "users" ? "myStudents" : tab.titleKey)}
              </button>
            ))}
          </div>
        </aside>

        <section className="grid">
          {currentTab === "users" ? <UsersTab /> : null}
          {currentTab === "courses" ? <CoursesTab /> : null}
          {currentTab === "groups" ? <GroupsTab /> : null}
          {currentTab === "submissions" ? <SubmissionsTab /> : null}
          {currentTab === "access" ? <AccessTab /> : null}
          {currentTab === "stats" ? <StatsTab /> : null}
          {currentTab === "settings" ? <SettingsTab /> : null}
        </section>
      </section>
    </main>
  );
}

function UsersTab() {
  const { profile } = useAuth();
  const {
    data,
    createProfile,
    updateProfile,
    enrollStudentToCourse,
    enrollStudentToCourseByIdentifier,
    removeStudentFromCourse,
  } = useSchoolData();
  const { locale, translate } = useLocale();
  const { message, run, tone } = useActionMessage();
  const isTeacher = profile?.role === "teacher";
  const teacherCourses = isTeacher
    ? data.courses.filter((course) => course.teacherIds.includes(profile.id))
    : [];
  const teacherCourseIds = new Set(teacherCourses.map((course) => course.id));
  const students = data.profiles.filter((item) => item.role === "student");
  const visibleStudents = isTeacher
    ? students.filter((student) =>
        student.assignedCourseIds.some((courseId) => teacherCourseIds.has(courseId)),
      )
    : students;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const ok = await run(() =>
      createProfile({
        fullName: String(formData.get("fullName") ?? ""),
        email: String(formData.get("email") ?? ""),
        phone: String(formData.get("phone") ?? ""),
        telegram: String(formData.get("telegram") ?? ""),
        schoolId: String(formData.get("schoolId") ?? ""),
        role: String(formData.get("role") ?? "student") as UserRole,
      }),
    );
    if (ok) form.reset();
  }

  return (
    <>
      {isTeacher ? (
        <section className="card">
          <div className="panel-title">
            <h2>{translate("myStudents")}</h2>
            <span className="badge">{visibleStudents.length}</span>
          </div>
          <ActionMessage message={message} tone={tone} />
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(form);
              const ok = await run(() =>
                enrollStudentToCourseByIdentifier(
                  String(formData.get("courseId") ?? ""),
                  String(formData.get("email") ?? ""),
                  String(formData.get("fullName") ?? ""),
                  String(formData.get("schoolId") ?? ""),
                ),
              );
              if (ok) form.reset();
            }}
          >
            <h3>{translate("addStudentToMyCourse")}</h3>
            <label>
              {translate("courses")}
              <select name="courseId" required>
                <option value="">{translate("selectCourse")}</option>
                {teacherCourses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {translate("fullName")}
              <input name="fullName" required />
            </label>
            <label>
              {translate("email")}
              <input name="email" required type="email" />
            </label>
            <label>
              {translate("schoolIdOptional")}
              <input name="schoolId" />
            </label>
            <button className="button" type="submit">
              <Plus size={16} /> {translate("assign")}
            </button>
          </form>
          <div className="grid" style={{ marginTop: 18 }}>
            {visibleStudents.length ? (
              visibleStudents.map((student) => (
                <article className="card compact" key={student.id}>
                  <strong>{studentDisplayName(student, locale)}</strong>
                  <p>{student.email}</p>
                  {student.schoolId ? <p className="muted">{student.schoolId}</p> : null}
                  <div className="grid">
                    {teacherCourses
                      .filter((course) => student.assignedCourseIds.includes(course.id))
                      .map((course) => (
                        <div className="lesson-strip" key={course.id}>
                          <span>{course.title}</span>
                          <button
                            className="secondary-button danger-button"
                            onClick={() => void run(() => removeStudentFromCourse(course.id, student.id))}
                            type="button"
                          >
                            <Trash2 size={16} /> {translate("removeStudent")}
                          </button>
                        </div>
                      ))}
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">{translate("noUsersYet")}</div>
            )}
          </div>
        </section>
      ) : (
      <>
        <section className="card">
        <h2>{translate("createUser")}</h2>
        <form className="form-grid" onSubmit={handleCreate}>
          <label>
            {translate("fullName")}
            <input name="fullName" required />
          </label>
          <label>
            {translate("email")}
            <input name="email" required type="email" />
          </label>
          <label>
            {translate("phone")}
            <input name="phone" />
          </label>
          <label>
            Telegram
            <input name="telegram" />
          </label>
          <label>
            {translate("schoolId")}
            <input name="schoolId" />
          </label>
          <label>
            {translate("role")}
            <select name="role" defaultValue="student">
              <option value="student">{translate("student")}</option>
              <option value="teacher">{translate("teacher")}</option>
              <option value="curator">{translate("curator")}</option>
              <option value="admin">{translate("administrator")}</option>
            </select>
          </label>
          <button className="button" type="submit">
            <Plus size={16} /> {translate("create")}
          </button>
        </form>
        <ActionMessage message={message} tone={tone} />
      </section>

      <section className="card">
        <div className="panel-title">
          <h2>{translate("users")}</h2>
          <span className="badge">{data.profiles.length}</span>
        </div>
        {data.profiles.length ? (
          <div className="grid">
            {data.profiles.map((profile) => (
              <form
                className="card compact form-grid"
                key={profile.id}
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  await run(() =>
                    updateProfile(profile.id, {
                      fullName: String(formData.get("fullName") ?? ""),
                      phone: String(formData.get("phone") ?? ""),
                      telegram: String(formData.get("telegram") ?? ""),
                      schoolId: String(formData.get("schoolId") ?? ""),
                      role: String(formData.get("role") ?? "student") as UserRole,
                    }),
                  );
                }}
              >
                <strong>{profile.email}</strong>
                <label>
                  {translate("fullName")}
                  <input name="fullName" defaultValue={profile.fullName} />
                </label>
                <label>
                  {translate("phone")}
                  <input name="phone" defaultValue={profile.phone} />
                </label>
                <label>
                  Telegram
                  <input name="telegram" defaultValue={profile.telegram} />
                </label>
                <label>
                  {translate("schoolId")}
                  <input name="schoolId" defaultValue={profile.schoolId} />
                </label>
                <label>
                  {translate("role")}
                  <select name="role" defaultValue={profile.role}>
                    <option value="student">{translate("student")}</option>
                    <option value="teacher">{translate("teacher")}</option>
                    <option value="curator">{translate("curator")}</option>
                    <option value="admin">{translate("administrator")}</option>
                  </select>
                </label>
                <button className="secondary-button" type="submit">
                  {translate("save")}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <div className="empty-state">{translate("noUsersYet")}</div>
        )}
      </section>

      <section className="card">
        <h2>{translate("assignCourseToStudent")}</h2>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const ok = await run(() =>
              enrollStudentToCourse(
                String(formData.get("courseId") ?? ""),
                String(formData.get("studentId") ?? ""),
              ),
            );
            if (ok) form.reset();
          }}
        >
          <label>
            {translate("student")}
            <select name="studentId" required>
              <option value="">{translate("selectStudent")}</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {studentDisplayName(student, locale)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {translate("courses")}
            <select name="courseId" required>
              <option value="">{translate("selectCourse")}</option>
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            {translate("assign")}
          </button>
        </form>
      </section>
      </>
      )}
    </>
  );
}

function CoursesTab() {
  const { profile } = useAuth();
  const {
    data,
    createCourse,
    updateCourse,
    archiveCourse,
    restoreCourse,
    deleteCourse,
    cleanupTestCourses,
    createModule,
    updateModule,
    deleteModule,
    createLesson,
    updateLesson,
    deleteLesson,
    uploadLessonMaterial,
    updateLessonMaterial,
    deleteLessonMaterial,
    createAssignment,
    deleteAssignment,
    assignTeacherToCourse,
    removeTeacherFromCourse,
    enrollStudentToCourseByIdentifier,
    removeStudentFromCourse,
    toggleLessonAccess,
    reviewSubmission,
  } = useSchoolData();
  const { locale, translate } = useLocale();
  const { message, run, tone } = useActionMessage();
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [secondaryTab, setSecondaryTab] = useState<"none" | "students" | "access" | "submissions">("none");
  const isAdmin = profile?.role === "admin";
  const isTeacher = profile?.role === "teacher";
  const courses = isTeacher
    ? data.courses.filter((course) => course.teacherIds.includes(profile?.id ?? ""))
    : data.courses;
  const teachers = data.profiles.filter((item) => item.role === "teacher");
  const testCourses = courses.filter(isTestCourse);
  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? courses[0];

  useEffect(() => {
    if (!selectedCourseId && courses[0]) {
      setSelectedCourseId(courses[0].id);
      return;
    }
    if (selectedCourseId && !courses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(courses[0]?.id ?? "");
    }
  }, [courses, selectedCourseId]);

  async function handleCreateCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const ok = await run(() =>
      createCourse({
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        language: String(formData.get("language") ?? "ru") as CourseLanguage,
        active: true,
        accessMode: String(formData.get("accessMode") ?? "manual") as AccessMode,
      }),
    );
    if (ok) {
      form.reset();
      setCreateOpen(false);
    }
  }

  const canManageCourse = selectedCourse
    ? isAdmin || selectedCourse.teacherIds.includes(profile?.id ?? "")
    : false;

  return (
    <section>
      <div className="course-selector-bar">
        <div className="course-selector-left">
          <label className="course-selector-label">
            {translate("courses")}
            <select
              className="course-selector-select"
              onChange={(e) => {
                setSelectedCourseId(e.target.value);
                setSecondaryTab("none");
              }}
              value={selectedCourse?.id ?? ""}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          <button className="button" onClick={() => setCreateOpen(true)} type="button">
            <Plus size={16} /> {translate("createCourse")}
          </button>
          {selectedCourse && canManageCourse ? (
            <button className="secondary-button" onClick={() => setSettingsOpen(true)} type="button">
              <Settings size={16} /> {translate("settings")}
            </button>
          ) : null}
          {selectedCourse && canManageCourse ? (
            <>
              {selectedCourse.active ? (
                <button
                  className="secondary-button"
                  onClick={() => {
                    if (window.confirm(translate("archiveCourseConfirm"))) {
                      void run(() => archiveCourse(selectedCourse.id));
                    }
                  }}
                  type="button"
                >
                  {translate("archiveCourse")}
                </button>
              ) : (
                <button className="secondary-button" onClick={() => void run(() => restoreCourse(selectedCourse.id))} type="button">
                  {translate("restoreCourse")}
                </button>
              )}
              <button
                className="secondary-button danger-button"
                onClick={() => {
                  if (window.confirm(translate("deleteCourseConfirm"))) {
                    void run(() => deleteCourse(selectedCourse.id));
                  }
                }}
                type="button"
              >
                <Trash2 size={16} /> {translate("deleteCourse")}
              </button>
            </>
          ) : null}
        </div>
        <ActionMessage message={message} tone={tone} />
      </div>

      {selectedCourse ? (
        <VisualCourseEditor
          course={selectedCourse}
          createAssignment={createAssignment}
          createLesson={createLesson}
          createModule={createModule}
          data={data}
          deleteAssignment={deleteAssignment}
          deleteLesson={deleteLesson}
          deleteLessonMaterial={deleteLessonMaterial}
          deleteModule={deleteModule}
          run={run}
          translate={translate}
          updateLesson={updateLesson}
          updateLessonMaterial={updateLessonMaterial}
          updateModule={updateModule}
          uploadLessonMaterial={uploadLessonMaterial}
        />
      ) : (
        <div className="empty-state">{translate("selectOrCreateCourse")}</div>
      )}

      {selectedCourse ? (
        <div className="course-secondary-tabs">
          <button
            className={secondaryTab === "students" ? "active" : ""}
            onClick={() => setSecondaryTab(secondaryTab === "students" ? "none" : "students")}
            type="button"
          >
            {translate("students")}
          </button>
          <button
            className={secondaryTab === "access" ? "active" : ""}
            onClick={() => setSecondaryTab(secondaryTab === "access" ? "none" : "access")}
            type="button"
          >
            {translate("accesses")}
          </button>
          <button
            className={secondaryTab === "submissions" ? "active" : ""}
            onClick={() => setSecondaryTab(secondaryTab === "submissions" ? "none" : "submissions")}
            type="button"
          >
            {translate("reviews")}
          </button>
        </div>
      ) : null}

      {selectedCourse && secondaryTab === "students" ? (
        <div style={{ marginTop: 18 }}>
          <CourseStudentsTab
            course={selectedCourse}
            data={data}
            enrollStudentToCourseByIdentifier={enrollStudentToCourseByIdentifier}
            locale={locale}
            profile={profile}
            removeStudentFromCourse={removeStudentFromCourse}
            run={run}
            translate={translate}
          />
        </div>
      ) : null}

      {selectedCourse && secondaryTab === "access" ? (
        <div style={{ marginTop: 18 }}>
          <CourseAccessPanel
            course={selectedCourse}
            data={data}
            locale={locale}
            profile={profile}
            run={run}
            toggleLessonAccess={toggleLessonAccess}
            translate={translate}
          />
        </div>
      ) : null}

      {selectedCourse && secondaryTab === "submissions" ? (
        <div style={{ marginTop: 18 }}>
          <CourseSubmissionsPanel
            course={selectedCourse}
            data={data}
            locale={locale}
            reviewSubmission={reviewSubmission}
            run={run}
            translate={translate}
          />
        </div>
      ) : null}

      {createOpen ? (
        <CreateCourseDialog
          handleCreateCourse={handleCreateCourse}
          locale={locale}
          onClose={() => setCreateOpen(false)}
          translate={translate}
        />
      ) : null}

      {settingsOpen && selectedCourse && canManageCourse ? (
        <CourseSettingsModal
          assignTeacherToCourse={assignTeacherToCourse}
          course={selectedCourse}
          isAdmin={isAdmin}
          locale={locale}
          onClose={() => setSettingsOpen(false)}
          removeTeacherFromCourse={removeTeacherFromCourse}
          run={run}
          teachers={teachers}
          translate={translate}
          updateCourse={updateCourse}
        />
      ) : null}

      {testCourses.length ? (
        <div className="danger-zone" style={{ marginTop: 18 }}>
          <button
            className="secondary-button danger-button"
            onClick={() => {
              if (window.confirm(translate("cleanupTestDataConfirm"))) {
                void run(() => cleanupTestCourses());
              }
            }}
            type="button"
          >
            <Trash2 size={16} /> {translate("cleanupTestData")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function CreateCourseDialog({
  handleCreateCourse,
  locale,
  onClose,
  translate,
}: {
  handleCreateCourse: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  locale: Locale;
  onClose: () => void;
  translate: (key: string) => string;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="card course-dialog">
        <div className="panel-title">
          <h2>{translate("createCourse")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">
            {translate("close")}
          </button>
        </div>
        <form className="form-grid" onSubmit={handleCreateCourse}>
          <label>
            {translate("title")}
            <input name="title" required />
          </label>
          <label>
            {translate("description")}
            <textarea name="description" required />
          </label>
          <label>
            {translate("courseLanguage")}
            <select name="language" defaultValue="ru">
              {courseLanguages.map((language) => (
                <option key={language} value={language}>
                  {language.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            {translate("accessMode")}
            <select name="accessMode" defaultValue="manual">
              {accessModes.map((mode) => (
                <option key={mode} value={mode}>
                  {accessModeLabel(mode, locale)}
                </option>
              ))}
            </select>
          </label>
          <button className="button" type="submit">
            <Plus size={16} /> {translate("createCourse")}
          </button>
        </form>
      </section>
    </div>
  );
}

function VisualCourseEditor({
  course,
  createAssignment,
  createLesson,
  createModule,
  data,
  deleteAssignment,
  deleteLesson,
  deleteLessonMaterial,
  deleteModule,
  run,
  translate,
  updateLesson,
  updateLessonMaterial,
  updateModule,
  uploadLessonMaterial,
}: {
  course: Course;
  createAssignment: (draft: Pick<Assignment, "lessonId" | "title" | "description" | "dueAt" | "allowTextAnswer" | "allowFileUpload" | "allowMultipleFiles" | "maxScore">) => Promise<void>;
  createLesson: (draft: Pick<Lesson, "moduleId" | "title" | "description" | "content" | "order" | "isOpenByDefault" | "hasAssignment">) => Promise<void>;
  createModule: (draft: Pick<CourseModule, "courseId" | "title" | "description" | "order">) => Promise<void>;
  data: SchoolData;
  deleteAssignment: (assignmentId: string) => Promise<void>;
  deleteLesson: (lessonId: string) => Promise<void>;
  deleteLessonMaterial: (material: LessonMaterial) => Promise<void>;
  deleteModule: (moduleId: string) => Promise<void>;
  run: ActionRunner;
  translate: (key: string) => string;
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>;
  updateLessonMaterial: (
    id: string,
    patch: Partial<Pick<LessonMaterial, "title" | "type" | "downloadable" | "order" | "externalUrl" | "content">>,
    file?: File,
  ) => Promise<void>;
  updateModule: (id: string, patch: Partial<Pick<CourseModule, "title" | "description" | "order">>) => Promise<void>;
  uploadLessonMaterial: (
    draft: Pick<LessonMaterial, "lessonId" | "title" | "type" | "downloadable" | "order"> & Partial<Pick<LessonMaterial, "externalUrl" | "content">>,
    file?: File,
  ) => Promise<void>;
}) {
  const { locale } = useLocale();
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [moduleModal, setModuleModal] = useState<{ mode: "create" | "edit"; module?: CourseModule } | null>(null);
  const [lessonModal, setLessonModal] = useState<{ mode: "create" | "edit"; lesson?: Lesson } | null>(null);
  const [materialModal, setMaterialModal] = useState<{ mode: "create" | "edit"; material?: LessonMaterial } | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{ mode: "create"; } | null>(null);

  const modules = data.modules
    .filter((m) => m.courseId === course.id)
    .sort((a, b) => a.order - b.order);

  const selectedModule = modules.find((m) => m.id === selectedModuleId) ?? modules[0] ?? null;

  useEffect(() => {
    setSelectedModuleId("");
    setSelectedLessonId("");
  }, [course.id]);

  useEffect(() => {
    setSelectedLessonId("");
  }, [selectedModuleId]);

  const lessons = selectedModule
    ? data.lessons
        .filter((l) => l.moduleId === selectedModule.id)
        .sort((a, b) => a.order - b.order)
    : [];

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId) ?? lessons[0] ?? null;

  const lessonMaterials = selectedLesson
    ? data.materials
        .filter((m) => m.lessonId === selectedLesson.id)
        .sort((a, b) => a.order - b.order)
    : [];

  const lessonAssignments = selectedLesson
    ? data.assignments.filter((a) => a.lessonId === selectedLesson.id)
    : [];

  return (
    <>
      <div className="visual-map">
        <div className="visual-map-zone course-info-zone">
          <div className="visual-map-zone-header">
            <span className="zone-badge">{translate("courses")}</span>
          </div>
          <div className="visual-map-zone-body">
            <h3 style={{ marginBottom: 2 }}>{course.title}</h3>
            <p className="map-card-meta" style={{ marginBottom: 8 }}>{course.description}</p>
            <div className="course-info-field"><strong>{translate("courseLanguage")}:</strong> {course.language.toUpperCase()}</div>
            <div className="course-info-field"><strong>{translate("accessMode")}:</strong> {accessModeLabel(course.accessMode, locale)}</div>
            {course.accessStartsAt ? <div className="course-info-field"><strong>{translate("accessStartsAt")}:</strong> {new Date(course.accessStartsAt).toLocaleDateString(locale)}</div> : null}
            {course.accessEndsAt ? <div className="course-info-field"><strong>{translate("accessEndsAt")}:</strong> {new Date(course.accessEndsAt).toLocaleDateString(locale)}</div> : null}
          </div>
        </div>

        <div className="visual-map-zone">
          <div className="visual-map-zone-header">
            <span className="zone-badge module">{translate("addModule")}</span>
            <button className="button" onClick={() => setModuleModal({ mode: "create" })} type="button" style={{ minHeight: 30, fontSize: 12, padding: "4px 10px" }}>
              <Plus size={14} /> {translate("addModule")}
            </button>
          </div>
          <div className="visual-map-zone-body">
            {modules.length ? (
              modules.map((module) => {
                const lessonCount = data.lessons.filter((l) => l.moduleId === module.id).length;
                return (
                  <div
                    className={`map-card ${module.id === selectedModule?.id ? "active" : ""}`}
                    key={module.id}
                    onClick={() => setSelectedModuleId(module.id)}
                  >
                    <div className="map-card-header">
                      <span className="zone-badge module">{translate("module")}</span>
                      <span className="map-card-meta">{pluralizeLessons(lessonCount, locale)}</span>
                    </div>
                    <div className="map-card-title">{module.title}</div>
                    {module.description ? <div className="map-card-meta">{module.description}</div> : null}
                    <div className="map-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="secondary-button" onClick={() => setModuleModal({ mode: "edit", module })} type="button">
                        <Pencil size={13} /> {translate("edit")}
                      </button>
                      <button
                        className="secondary-button danger-button"
                        onClick={() => {
                          if (window.confirm(translate("deleteModuleConfirm"))) {
                            void run(() => deleteModule(module.id));
                          }
                        }}
                        type="button"
                      >
                        <Trash2 size={13} /> {translate("delete")}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty-zone-hint">{translate("noModulesYet")}</div>
            )}
          </div>
        </div>

        <div className="visual-map-zone">
          <div className="visual-map-zone-header">
            <span className="zone-badge lesson">{translate("courseStructure")}</span>
            {selectedModule ? (
              <button className="button" onClick={() => setLessonModal({ mode: "create" })} type="button" style={{ minHeight: 30, fontSize: 12, padding: "4px 10px" }}>
                <Plus size={14} /> {translate("addLesson")}
              </button>
            ) : null}
          </div>
          <div className="visual-map-zone-body">
            {selectedModule ? (
              lessons.length ? (
                lessons.map((lesson) => {
                  const matCount = data.materials.filter((m) => m.lessonId === lesson.id).length;
                  const hwCount = data.assignments.filter((a) => a.lessonId === lesson.id).length;
                  return (
                    <div
                      className={`map-card ${lesson.id === selectedLesson?.id ? "active" : ""}`}
                      key={lesson.id}
                      onClick={() => setSelectedLessonId(lesson.id)}
                    >
                      <div className="map-card-header">
                        <span className="zone-badge lesson">{translate("lesson")}</span>
                      </div>
                      <div className="map-card-title">{lesson.title}</div>
                      <div className="map-card-meta">
                        {translate("lessonMaterials")}: {matCount} · {translate("homework")}: {hwCount > 0 ? translate("active") : translate("closed")}
                      </div>
                      <div className="map-card-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="secondary-button" onClick={() => setLessonModal({ mode: "edit", lesson })} type="button">
                          <Pencil size={13} /> {translate("edit")}
                        </button>
                        <button
                          className="secondary-button danger-button"
                          onClick={() => {
                            if (window.confirm(translate("deleteLessonConfirm"))) {
                              void run(() => deleteLesson(lesson.id));
                            }
                          }}
                          type="button"
                        >
                          <Trash2 size={13} /> {translate("delete")}
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-zone-hint">{translate("noLessonsYet")}</div>
              )
            ) : (
              <div className="empty-zone-hint">{translate("selectOrCreateCourse")}</div>
            )}
          </div>
        </div>

        <div className="visual-map-zone">
          <div className="visual-map-zone-header">
            <span className="zone-badge">{translate("courseEditor")}</span>
          </div>
          <div className="visual-map-zone-body">
            {selectedLesson ? (
              <>
                <div className="detail-section">
                  <div className="panel-title" style={{ marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>{translate("lessonMaterials")}</h4>
                    <button className="button" onClick={() => setMaterialModal({ mode: "create" })} type="button" style={{ minHeight: 28, fontSize: 12, padding: "4px 10px" }}>
                      <Plus size={14} /> {translate("addMaterial")}
                    </button>
                  </div>
                  {lessonMaterials.length ? (
                    lessonMaterials.map((material) => (
                      <div className="detail-item" key={material.id}>
                        <span>
                          <strong>{materialTypeLabel(material.type, translate)}</strong> — {material.title}
                        </span>
                        <div className="compact-options">
                          {material.externalUrl ? (
                            <a className="secondary-button" href={material.externalUrl} rel="noreferrer" target="_blank" style={{ minHeight: 26, fontSize: 12, padding: "3px 7px" }}>
                              <ExternalLink size={13} />
                            </a>
                          ) : null}
                          <button className="secondary-button" onClick={() => setMaterialModal({ mode: "edit", material })} type="button" style={{ minHeight: 26, fontSize: 12, padding: "3px 7px" }}>
                            <Pencil size={13} /> {translate("edit")}
                          </button>
                          <button
                            className="secondary-button danger-button"
                            onClick={() => {
                              if (window.confirm(translate("deleteMaterialConfirm"))) {
                                void run(() => deleteLessonMaterial(material));
                              }
                            }}
                            type="button"
                            style={{ minHeight: 26, fontSize: 12, padding: "3px 7px" }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-zone-hint">{translate("noMaterialsYet")}</div>
                  )}
                </div>

                <div className="detail-section">
                  <div className="panel-title" style={{ marginBottom: 8 }}>
                    <h4 style={{ margin: 0 }}>{translate("homework")}</h4>
                    <button className="button" onClick={() => setAssignmentModal({ mode: "create" })} type="button" style={{ minHeight: 28, fontSize: 12, padding: "4px 10px" }}>
                      <Plus size={14} /> {translate("createAssignment")}
                    </button>
                  </div>
                  {lessonAssignments.length ? (
                    lessonAssignments.map((assignment) => (
                      <div className="detail-item" key={assignment.id}>
                        <span>
                          <strong>{assignment.title}</strong>
                          {assignment.dueAt ? <span className="muted"> · {assignment.dueAt}</span> : null}
                        </span>
                        <div className="compact-options">
                          <button
                            className="secondary-button danger-button"
                            onClick={() => {
                              if (window.confirm(translate("deleteAssignmentConfirm"))) {
                                void run(() => deleteAssignment(assignment.id));
                              }
                            }}
                            type="button"
                            style={{ minHeight: 26, fontSize: 12, padding: "3px 7px" }}
                          >
                            <Trash2 size={13} /> {translate("delete")}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-zone-hint">{translate("noAssignmentsYet")}</div>
                  )}
                </div>

              </>
            ) : (
              <div className="empty-zone-hint">{translate("selectOrCreateCourse")}</div>
            )}
          </div>
        </div>
      </div>

      {moduleModal ? (
        <ModuleEditModal
          course={course}
          module={moduleModal.mode === "edit" ? moduleModal.module : undefined}
          mode={moduleModal.mode}
          onClose={() => setModuleModal(null)}
          run={run}
          translate={translate}
          createModule={createModule}
          updateModule={updateModule}
          moduleCount={modules.length}
        />
      ) : null}

      {lessonModal && selectedModule ? (
        <LessonEditModal
          lesson={lessonModal.mode === "edit" ? lessonModal.lesson : undefined}
          mode={lessonModal.mode}
          moduleId={selectedModule.id}
          onClose={() => setLessonModal(null)}
          run={run}
          translate={translate}
          createLesson={createLesson}
          updateLesson={updateLesson}
          lessonCount={lessons.length}
        />
      ) : null}

      {materialModal && selectedLesson ? (
        <MaterialEditModal
          material={materialModal.mode === "edit" ? materialModal.material : undefined}
          mode={materialModal.mode}
          lessonId={selectedLesson.id}
          onClose={() => setMaterialModal(null)}
          run={run}
          translate={translate}
          uploadLessonMaterial={uploadLessonMaterial}
          updateLessonMaterial={updateLessonMaterial}
          materialCount={lessonMaterials.length}
        />
      ) : null}

      {assignmentModal && selectedLesson ? (
        <AssignmentCreateModal
          lessonId={selectedLesson.id}
          onClose={() => setAssignmentModal(null)}
          run={run}
          translate={translate}
          createAssignment={createAssignment}
        />
      ) : null}
    </>
  );
}

type ActionRunner = (action: () => Promise<void>) => Promise<boolean>;

function ModuleEditModal({
  course,
  module,
  mode,
  onClose,
  run,
  translate,
  createModule,
  updateModule,
  moduleCount,
}: {
  course: Course;
  module?: CourseModule;
  mode: "create" | "edit";
  onClose: () => void;
  run: ActionRunner;
  translate: (key: string) => string;
  createModule: (draft: Pick<CourseModule, "courseId" | "title" | "description" | "order">) => Promise<void>;
  updateModule: (id: string, patch: Partial<Pick<CourseModule, "title" | "description" | "order">>) => Promise<void>;
  moduleCount: number;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <h2>{mode === "create" ? translate("addModule") : translate("saveModule")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">{translate("close")}</button>
        </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (mode === "create") {
              const ok = await run(() =>
                createModule({
                  courseId: course.id,
                  title: String(formData.get("title") ?? ""),
                  description: String(formData.get("description") ?? ""),
                  order: moduleCount + 1,
                }),
              );
              if (ok) onClose();
            } else if (module) {
              const ok = await run(() =>
                updateModule(module.id, {
                  title: String(formData.get("title") ?? ""),
                  description: String(formData.get("description") ?? ""),
                }),
              );
              if (ok) onClose();
            }
          }}
        >
          <label>{translate("title")}<input name="title" defaultValue={module?.title ?? ""} required /></label>
          <label>{translate("description")}<textarea name="description" defaultValue={module?.description ?? ""} /></label>
          <button className="button" type="submit">{mode === "create" ? translate("addModule") : translate("saveModule")}</button>
        </form>
      </section>
    </div>
  );
}

function LessonEditModal({
  lesson,
  mode,
  moduleId,
  onClose,
  run,
  translate,
  createLesson,
  updateLesson,
  lessonCount,
}: {
  lesson?: Lesson;
  mode: "create" | "edit";
  moduleId: string;
  onClose: () => void;
  run: ActionRunner;
  translate: (key: string) => string;
  createLesson: (draft: Pick<Lesson, "moduleId" | "title" | "description" | "content" | "order" | "isOpenByDefault" | "hasAssignment">) => Promise<void>;
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>;
  lessonCount: number;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <h2>{mode === "create" ? translate("addLesson") : translate("saveLesson")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">{translate("close")}</button>
        </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            if (mode === "create") {
              const ok = await run(() =>
                createLesson({
                  moduleId,
                  title: String(formData.get("title") ?? ""),
                  description: String(formData.get("description") ?? ""),
                  content: String(formData.get("content") ?? ""),
                  order: lessonCount + 1,
                  isOpenByDefault: true,
                  hasAssignment: formData.get("hasAssignment") === "on",
                }),
              );
              if (ok) onClose();
            } else if (lesson) {
              const ok = await run(() =>
                updateLesson(lesson.id, {
                  title: String(formData.get("title") ?? ""),
                  description: String(formData.get("description") ?? ""),
                  content: String(formData.get("content") ?? ""),
                  isOpenByDefault: true,
                  hasAssignment: formData.get("hasAssignment") === "on",
                }),
              );
              if (ok) onClose();
            }
          }}
        >
          <label>{translate("title")}<input name="title" defaultValue={lesson?.title ?? ""} required /></label>
          <label>{translate("description")}<textarea name="description" defaultValue={lesson?.description ?? ""} /></label>
          <label>{translate("content")}<textarea name="content" defaultValue={lesson?.content ?? ""} /></label>
          <label>{checkboxLabel(<><input defaultChecked={lesson?.hasAssignment ?? false} name="hasAssignment" type="checkbox" /> {translate("hasAssignment")}</>)}</label>
          <button className="button" type="submit">{mode === "create" ? translate("addLesson") : translate("saveLesson")}</button>
        </form>
      </section>
    </div>
  );
}

function MaterialEditModal({
  material,
  mode,
  lessonId,
  onClose,
  run,
  translate,
  uploadLessonMaterial,
  updateLessonMaterial,
  materialCount,
}: {
  material?: LessonMaterial;
  mode: "create" | "edit";
  lessonId: string;
  onClose: () => void;
  run: ActionRunner;
  translate: (key: string) => string;
  uploadLessonMaterial: (
    draft: Pick<LessonMaterial, "lessonId" | "title" | "type" | "downloadable" | "order"> & Partial<Pick<LessonMaterial, "externalUrl" | "content">>,
    file?: File,
  ) => Promise<void>;
  updateLessonMaterial: (
    id: string,
    patch: Partial<Pick<LessonMaterial, "title" | "type" | "downloadable" | "order" | "externalUrl" | "content">>,
    file?: File,
  ) => Promise<void>;
  materialCount: number;
}) {
  const [type, setType] = useState<MaterialType>(material?.type ?? "video");

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <h2>{mode === "create" ? translate("addMaterial") : translate("edit")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">{translate("close")}</button>
        </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const file = formData.get("file");
            const selectedType = String(formData.get("type") ?? type) as MaterialType;
            if (mode === "create") {
              const ok = await run(() =>
                uploadLessonMaterial(
                  {
                    lessonId,
                    title: String(formData.get("title") ?? ""),
                    type: selectedType,
                    downloadable: formData.get("downloadable") === "on",
                    order: materialCount + 1,
                    externalUrl: String(formData.get("externalUrl") ?? ""),
                    content: String(formData.get("content") ?? ""),
                  },
                  file instanceof File && file.size > 0 ? file : undefined,
                ),
              );
              if (ok) onClose();
            } else if (material) {
              const ok = await run(() =>
                updateLessonMaterial(
                  material.id,
                  {
                    title: String(formData.get("title") ?? ""),
                    type: selectedType,
                    downloadable: formData.get("downloadable") === "on",
                    externalUrl: String(formData.get("externalUrl") ?? ""),
                    content: String(formData.get("content") ?? ""),
                  },
                  file instanceof File && file.size > 0 ? file : undefined,
                ),
              );
              if (ok) onClose();
            }
          }}
        >
          <label>{translate("title")}<input name="title" defaultValue={material?.title ?? ""} required /></label>
          <label>
            {translate("materialType")}
            <select name="type" onChange={(event) => setType(event.target.value as MaterialType)} value={type}>
              {materialTypes.map((item) => (
                <option key={item} value={item}>{materialTypeLabel(item, translate)}</option>
              ))}
            </select>
          </label>
          {type === "video" ? (
            <label>{translate("videoUrl")}<input name="externalUrl" defaultValue={material?.externalUrl ?? ""} placeholder="https://..." required type="url" /></label>
          ) : null}
          {type === "text" ? (
            <label>{translate("materialText")}<textarea name="content" defaultValue={material?.content ?? ""} required /></label>
          ) : null}
          {type === "pdf" || type === "docx" ? (
            <label>{mode === "edit" ? translate("replaceFile") : translate("file")}<input accept={fileAcceptForType(type)} name="file" type={mode === "edit" ? "file" : "file"} required={mode === "create"} /></label>
          ) : null}
          <label>{checkboxLabel(<><input defaultChecked={material?.downloadable ?? (type !== "video" && type !== "text")} name="downloadable" type="checkbox" /> {translate("allowDownload")}</>)}</label>
          <button className="button" type="submit">{mode === "create" ? translate("addMaterial") : translate("save")}</button>
        </form>
      </section>
    </div>
  );
}

function AssignmentCreateModal({
  lessonId,
  onClose,
  run,
  translate,
  createAssignment,
}: {
  lessonId: string;
  onClose: () => void;
  run: ActionRunner;
  translate: (key: string) => string;
  createAssignment: (draft: Pick<Assignment, "lessonId" | "title" | "description" | "dueAt" | "allowTextAnswer" | "allowFileUpload" | "allowMultipleFiles" | "maxScore">) => Promise<void>;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <h2>{translate("createAssignment")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">{translate("close")}</button>
        </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            const ok = await run(() =>
              createAssignment({
                lessonId,
                title: String(formData.get("title") ?? ""),
                description: String(formData.get("description") ?? ""),
                dueAt: String(formData.get("dueAt") ?? ""),
                allowTextAnswer: formData.get("allowTextAnswer") === "on",
                allowFileUpload: formData.get("allowFileUpload") === "on",
                allowMultipleFiles: formData.get("allowMultipleFiles") === "on",
                maxScore: Number(formData.get("maxScore") ?? 100),
              }),
            );
            if (ok) onClose();
          }}
        >
          <label>{translate("title")}<input name="title" required /></label>
          <label>{translate("description")}<textarea name="description" /></label>
          <label>{translate("dueDate")}<input name="dueAt" type="date" /></label>
          <label>{translate("maxScore")}<input name="maxScore" defaultValue={100} max={100} min={0} type="number" /></label>
          <div className="compact-options">
            <label>{checkboxLabel(<><input defaultChecked name="allowTextAnswer" type="checkbox" /> {translate("textAnswer")}</>)}</label>
            <label>{checkboxLabel(<><input name="allowFileUpload" type="checkbox" /> {translate("fileUpload")}</>)}</label>
            <label>{checkboxLabel(<><input name="allowMultipleFiles" type="checkbox" /> {translate("multipleFiles")}</>)}</label>
          </div>
          <button className="button" type="submit">{translate("createAssignment")}</button>
        </form>
      </section>
    </div>
  );
}

function CourseStudentsTab({
  course,
  data,
  enrollStudentToCourseByIdentifier,
  locale,
  profile,
  removeStudentFromCourse,
  run,
  translate,
}: {
  course: Course;
  data: SchoolData;
  enrollStudentToCourseByIdentifier: (courseId: string, email: string, fullName: string, schoolId?: string) => Promise<void>;
  locale: Locale;
  profile: Profile | null;
  removeStudentFromCourse: (courseId: string, studentId: string) => Promise<void>;
  run: ActionRunner;
  translate: (key: string) => string;
}) {
  const teacherCourses = data.courses.filter(
    (item) => profile?.role !== "teacher" || item.teacherIds.includes(profile.id),
  );
  const teacherCourseIds = new Set(teacherCourses.map((item) => item.id));
  const students = data.profiles
    .filter((item) => item.role === "student")
    .filter((student) =>
      student.assignedCourseIds.some((courseId) => teacherCourseIds.has(courseId)),
    );
  const courseStudents = students.filter((student) => student.assignedCourseIds.includes(course.id));

  return (
    <section className="grid">
      <form
        className="card compact form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          const ok = await run(() =>
            enrollStudentToCourseByIdentifier(
              String(formData.get("courseId") ?? course.id),
              String(formData.get("email") ?? ""),
              String(formData.get("fullName") ?? ""),
              String(formData.get("schoolId") ?? ""),
            ),
          );
          if (ok) form.reset();
        }}
      >
        <h3>{translate("addStudentToMyCourse")}</h3>
        <label>
          {translate("courses")}
          <select name="courseId" defaultValue={course.id} required>
            {teacherCourses.map((item) => (
              <option key={item.id} value={item.id}>{item.title}</option>
            ))}
          </select>
        </label>
        <label>{translate("fullName")}<input name="fullName" required /></label>
        <label>{translate("email")}<input name="email" required type="email" /></label>
        <label>{translate("schoolIdOptional")}<input name="schoolId" /></label>
        <button className="button" type="submit"><Plus size={16} /> {translate("assign")}</button>
      </form>

      <div className="grid">
        {courseStudents.length ? (
          courseStudents.map((student) => {
            const assignedTeacherCourses = teacherCourses.filter((item) =>
              student.assignedCourseIds.includes(item.id),
            );
            return (
              <article className="card compact" key={student.id}>
                <strong>{studentDisplayName(student, locale)}</strong>
                <p>{student.email}</p>
                {student.schoolId ? <p className="muted">{student.schoolId}</p> : null}
                <div className="grid">
                  {assignedTeacherCourses.map((item) => (
                    <div className="lesson-strip" key={item.id}>
                      <span>{item.title}</span>
                      <button
                        className="secondary-button danger-button"
                        onClick={() => void run(() => removeStudentFromCourse(item.id, student.id))}
                        type="button"
                      >
                        <Trash2 size={16} /> {translate("removeStudent")}
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">{translate("noUsersYet")}</div>
        )}
      </div>
    </section>
  );
}

function CourseAccessPanel({
  course,
  data,
  locale,
  profile,
  run,
  toggleLessonAccess,
  translate,
}: {
  course: Course;
  data: SchoolData;
  locale: Locale;
  profile: Profile | null;
  run: ActionRunner;
  toggleLessonAccess: (lessonId: string, targetId: string, isOpen: boolean, targetType?: LessonAccess["targetType"]) => Promise<void>;
  translate: (key: string) => string;
}) {
  const [targetType, setTargetType] = useState<LessonAccess["targetType"]>("student");
  const modules = data.modules.filter((module) => module.courseId === course.id);
  const moduleIds = new Set(modules.map((module) => module.id));
  const lessons = data.lessons.filter((lesson) => moduleIds.has(lesson.moduleId));
  const isTeacher = profile?.role === "teacher";
  const teacherCourseIds = new Set(
    isTeacher
      ? data.courses.filter((item) => item.teacherIds.includes(profile.id)).map((item) => item.id)
      : data.courses.map((item) => item.id),
  );
  const teacherGroupIds = new Set(
    data.groups
      .filter((group) => group.courseIds.some((courseId) => teacherCourseIds.has(courseId)))
      .map((group) => group.id),
  );
  const teacherStreamIds = new Set([
    ...data.courses.filter((item) => teacherCourseIds.has(item.id)).flatMap((item) => item.streamIds),
    ...data.groups.filter((group) => teacherGroupIds.has(group.id) && group.streamId).map((group) => group.streamId),
  ]);
  const targetOptions =
    targetType === "student"
      ? data.profiles
          .filter((item) => item.role === "student" && item.assignedCourseIds.includes(course.id))
          .map((student) => ({ id: student.id, title: studentDisplayName(student, locale) }))
      : targetType === "group"
        ? data.groups
            .filter((group) => !isTeacher || teacherGroupIds.has(group.id))
            .filter((group) => group.courseIds.includes(course.id))
            .map((group) => ({ id: group.id, title: group.title }))
        : data.streams
            .filter((stream) => !isTeacher || teacherStreamIds.has(stream.id))
            .filter((stream) => course.streamIds.includes(stream.id))
            .map((stream) => ({ id: stream.id, title: stream.title }));

  return (
    <section className="grid access-panel">
      {lessons.map((lesson) => (
        <form
          className="access-strip"
          key={lesson.id}
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            await run(() =>
              toggleLessonAccess(
                lesson.id,
                String(formData.get("targetId") ?? ""),
                formData.get("accessAction") === "open",
                targetType,
              ),
            );
          }}
        >
          <strong>{lesson.title}</strong>
          <label>
            {translate("accessTargetType")}
            <select
              name="targetType"
              onChange={(event) => setTargetType(event.target.value as LessonAccess["targetType"])}
              value={targetType}
            >
              <option value="student">{translate("student")}</option>
              <option value="group">{translate("group")}</option>
              <option value="stream">{translate("stream")}</option>
            </select>
          </label>
          <label>
            {translate("selectTarget")}
            <select name="targetId" required>
              <option value="">{translate("selectTarget")}</option>
              {targetOptions.map((target) => (
                <option key={`${targetType}-${target.id}`} value={target.id}>{target.title}</option>
              ))}
            </select>
          </label>
          <div className="access-actions">
            <button className="button" name="accessAction" type="submit" value="open">
              {translate("openAccess")}
            </button>
            <button className="secondary-button" name="accessAction" type="submit" value="close">
              {translate("closeAccess")}
            </button>
          </div>
        </form>
      ))}
      {!lessons.length ? <div className="empty-state">{translate("noLessonsYet")}</div> : null}
    </section>
  );
}

function CourseSubmissionsPanel({
  course,
  data,
  locale,
  reviewSubmission,
  run,
  translate,
}: {
  course: Course;
  data: SchoolData;
  locale: Locale;
  reviewSubmission: (id: string, patch: Pick<AssignmentSubmission, "status" | "score" | "reviewerComment">) => Promise<void>;
  run: ActionRunner;
  translate: (key: string) => string;
}) {
  const modules = data.modules.filter((module) => module.courseId === course.id);
  const moduleIds = new Set(modules.map((module) => module.id));
  const lessonIds = new Set(data.lessons.filter((lesson) => moduleIds.has(lesson.moduleId)).map((lesson) => lesson.id));
  const assignments = data.assignments.filter((assignment) => lessonIds.has(assignment.lessonId));
  const assignmentIds = new Set(assignments.map((assignment) => assignment.id));
  const submissions = data.submissions
    .filter((submission) => assignmentIds.has(submission.assignmentId))
    .map((submission) => ({
      ...submission,
      assignment: assignments.find((assignment) => assignment.id === submission.assignmentId),
      student: data.profiles.find((profile) => profile.id === submission.studentId),
    }));

  return (
    <section className="grid">
      <div className="panel-title">
        <h3>{translate("homeworkReview")}</h3>
        <span className="badge">{submissions.length}</span>
      </div>
      {submissions.length ? (
        submissions.map((submission) => (
          <article className="card compact" key={submission.id}>
            <div className="panel-title">
              <div>
                <h3>{submission.assignment?.title ?? translate("homework")}</h3>
                <p>{submission.student ? studentDisplayName(submission.student, locale) : translate("nameMissing")}</p>
              </div>
              <span className={`status ${submissionTone(submission.status)}`}>
                {submissionLabel(submission.status, locale)}
              </span>
            </div>
            <p>{submission.textAnswer}</p>
            {submission.files.length ? (
              <div className="file-list">
                <strong>{translate("attachedFiles")}</strong>
                {submission.files.map((file) =>
                  file.url ? (
                    <a className="file-link" href={file.url} key={file.path} rel="noreferrer" target="_blank">
                      <Download size={14} /><span>{file.name}</span><span className="status ok">{translate("openFile")}</span>
                    </a>
                  ) : (
                    <span className="file-link" key={file.path}><Download size={14} /><span>{file.name}</span></span>
                  ),
                )}
              </div>
            ) : null}
            <form
              className="form-grid"
              onSubmit={async (event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
                await run(() =>
                  reviewSubmission(submission.id, {
                    status: String(formData.get("status") ?? "accepted") as SubmissionStatus,
                    score: Number(formData.get("score") ?? 0),
                    reviewerComment: String(formData.get("reviewerComment") ?? ""),
                  }),
                );
              }}
            >
              <label>{translate("score")}<input defaultValue={submission.score ?? 100} max={100} min={0} name="score" type="number" /></label>
              <label>
                {translate("reviews")}
                <select name="status" defaultValue={submission.status}>
                  <option value="accepted">{submissionLabel("accepted", locale)}</option>
                  <option value="needs_revision">{submissionLabel("needs_revision", locale)}</option>
                  <option value="in_review">{submissionLabel("in_review", locale)}</option>
                </select>
              </label>
              <label>{translate("comment")}<textarea name="reviewerComment" defaultValue={submission.reviewerComment} /></label>
              <button className="button" type="submit"><CheckCircle2 size={16} /> {translate("saveReview")}</button>
            </form>
          </article>
        ))
      ) : (
        <div className="empty-state">{translate("noSubmissionsForReview")}</div>
      )}
    </section>
  );
}

function CourseSettingsModal({
  assignTeacherToCourse,
  course,
  isAdmin,
  locale,
  onClose,
  removeTeacherFromCourse,
  run,
  teachers,
  translate,
  updateCourse,
}: {
  assignTeacherToCourse: (courseId: string, teacherId: string) => Promise<void>;
  course: Course;
  isAdmin: boolean;
  locale: Locale;
  onClose: () => void;
  removeTeacherFromCourse: (courseId: string, teacherId: string) => Promise<void>;
  run: ActionRunner;
  teachers: Array<{ id: string; fullName: string; email: string }>;
  translate: (key: string) => string;
  updateCourse: (id: string, patch: Partial<Course>) => Promise<void>;
}) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [language, setLanguage] = useState<CourseLanguage>(course.language);
  const [accessMode, setAccessMode] = useState<AccessMode>(course.accessMode);
  const [accessStartsAt, setAccessStartsAt] = useState(toDateTimeLocalValue(course.accessStartsAt));
  const [accessEndsAt, setAccessEndsAt] = useState(toDateTimeLocalValue(course.accessEndsAt));
  useEffect(() => {
    setTitle(course.title);
    setDescription(course.description);
    setLanguage(course.language);
    setAccessMode(course.accessMode);
    setAccessStartsAt(toDateTimeLocalValue(course.accessStartsAt));
    setAccessEndsAt(toDateTimeLocalValue(course.accessEndsAt));
  }, [
    course.id,
    course.title,
    course.description,
    course.language,
    course.accessMode,
    course.accessStartsAt,
    course.accessEndsAt,
  ]);

  const assignedTeachers = teachers.filter((teacher) => course.teacherIds.includes(teacher.id));
  const availableTeachers = teachers.filter((teacher) => !course.teacherIds.includes(teacher.id));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title">
          <h2>{translate("settings")}</h2>
          <button className="secondary-button" onClick={onClose} type="button">{translate("close")}</button>
        </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            await run(() =>
              updateCourse(course.id, {
                title: String(formData.get("title") ?? ""),
                description: String(formData.get("description") ?? ""),
                language: String(formData.get("language") ?? "ru") as CourseLanguage,
                accessMode: String(formData.get("accessMode") ?? "manual") as AccessMode,
                accessStartsAt: String(formData.get("accessStartsAt") ?? ""),
                accessEndsAt: String(formData.get("accessEndsAt") ?? ""),
              }),
            );
          }}
        >
          <label>{translate("title")}<input name="title" onChange={(e) => setTitle(e.target.value)} value={title} /></label>
          <label>{translate("description")}<textarea name="description" onChange={(e) => setDescription(e.target.value)} value={description} /></label>
          <label>
            {translate("courseLanguage")}
            <select name="language" onChange={(e) => setLanguage(e.target.value as CourseLanguage)} value={language}>
              {courseLanguages.map((lang) => (
                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
              ))}
            </select>
          </label>
          <label>
            {translate("accessMode")}
            <select name="accessMode" onChange={(e) => setAccessMode(e.target.value as AccessMode)} value={accessMode}>
              {accessModes.map((mode) => (
                <option key={mode} value={mode}>{accessModeLabel(mode, locale)}</option>
              ))}
            </select>
          </label>
          <label>{translate("accessStartsAt")}<input name="accessStartsAt" onChange={(e) => setAccessStartsAt(e.target.value)} type="datetime-local" value={accessStartsAt} /></label>
          <label>{translate("accessEndsAt")}<input name="accessEndsAt" onChange={(e) => setAccessEndsAt(e.target.value)} type="datetime-local" value={accessEndsAt} /></label>
          <button className="button" type="submit">{translate("saveCourse")}</button>
        </form>

        {isAdmin ? (
          <>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
            <h3>{translate("courseTeachers")}</h3>
            <div className="grid" style={{ marginTop: 8 }}>
              {assignedTeachers.length ? (
                assignedTeachers.map((teacher) => (
                  <div className="lesson-strip" key={teacher.id}>
                    <span><strong>{teacher.fullName}</strong><span className="muted"> {teacher.email}</span></span>
                    <button
                      className="secondary-button"
                      onClick={() => void run(() => removeTeacherFromCourse(course.id, teacher.id))}
                      type="button"
                    >
                      <Trash2 size={16} /> {translate("removeTeacher")}
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">{translate("noCourseTeachers")}</div>
              )}
            </div>
            <form
              className="form-grid"
              style={{ marginTop: 12 }}
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const formData = new FormData(form);
                const ok = await run(() =>
                  assignTeacherToCourse(course.id, String(formData.get("teacherId") ?? "")),
                );
                if (ok) form.reset();
              }}
            >
              <label>
                {translate("teacher")}
                <select name="teacherId" required>
                  <option value="">{translate("selectTeacher")}</option>
                  {availableTeachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                  ))}
                </select>
              </label>
              <button className="button" type="submit"><Plus size={16} /> {translate("assignTeacher")}</button>
            </form>
          </>
        ) : null}
      </section>
    </div>
  );
}

function GroupsTab() {
  const { data, createStream, createGroup, addStudentToGroup, enrollGroupToCourse } = useSchoolData();
  const { locale, translate } = useLocale();
  const { message, run, tone } = useActionMessage();
  const students = data.profiles.filter((item) => item.role === "student");
  const curators = data.profiles.filter((item) => item.role === "curator");

  return (
    <section className="card">
      <h2>{translate("groupsStreams")}</h2>
      <ActionMessage message={message} tone={tone} />
      <div className="dashboard-grid">
        <form
          className="form-grid card compact"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const ok = await run(() => createStream(String(formData.get("title") ?? "")));
            if (ok) form.reset();
          }}
        >
          <h3>{translate("createStream")}</h3>
          <input name="title" placeholder={translate("streamTitle")} required />
          <button className="button" type="submit">
            {translate("createStream")}
          </button>
        </form>

        <form
          className="form-grid card compact"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const formData = new FormData(form);
            const ok = await run(() =>
              createGroup({
                title: String(formData.get("title") ?? ""),
                streamId: String(formData.get("streamId") ?? ""),
                curatorId: String(formData.get("curatorId") ?? ""),
              }),
            );
            if (ok) form.reset();
          }}
        >
          <h3>{translate("createGroup")}</h3>
          <input name="title" placeholder={translate("groupTitle")} required />
          <select name="streamId">
            <option value="">{translate("noStream")}</option>
            {data.streams.map((stream) => (
              <option key={stream.id} value={stream.id}>
                {stream.title}
              </option>
            ))}
          </select>
          <select name="curatorId">
            <option value="">{translate("noCurator")}</option>
            {curators.map((curator) => (
              <option key={curator.id} value={curator.id}>
                {curator.fullName}
              </option>
            ))}
          </select>
          <button className="button" type="submit">
            {translate("createGroup")}
          </button>
        </form>
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        {data.groups.length ? (
          data.groups.map((group) => {
            const stream = data.streams.find((item) => item.id === group.streamId);
            const curator = data.profiles.find((item) => item.id === group.curatorId);
            return (
              <article className="card compact" key={group.id}>
                <div className="panel-title">
                  <div>
                    <h3>{group.title}</h3>
                    <p>{stream?.title ?? translate("streamNotAssigned")}</p>
                  </div>
                  <span className="badge">
                    {group.studentIds.length} {translate("studentsCount")}
                  </span>
                </div>
                <p>
                  <strong>{translate("curator")}:</strong> {curator?.fullName ?? translate("notAssigned")}
                </p>
                <form
                  className="form-grid"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const formData = new FormData(form);
                    const ok = await run(() => addStudentToGroup(group.id, String(formData.get("studentId") ?? "")));
                    if (ok) form.reset();
                  }}
                >
                  <select name="studentId" required>
                    <option value="">{translate("addStudent")}</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {studentDisplayName(student, locale)}
                      </option>
                    ))}
                  </select>
                  <button className="secondary-button" type="submit">
                    {translate("addStudent")}
                  </button>
                </form>
                <form
                  className="form-grid"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const formData = new FormData(form);
                    const ok = await run(() => enrollGroupToCourse(String(formData.get("courseId") ?? ""), group.id));
                    if (ok) form.reset();
                  }}
                >
                  <select name="courseId" required>
                    <option value="">{translate("assignCourseToGroup")}</option>
                    {data.courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                  <button className="secondary-button" type="submit">
                    {translate("assign")}
                  </button>
                </form>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{translate("student")}</th>
                        <th>{translate("schoolId")}</th>
                        <th>{translate("progress")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.studentIds.map((studentId) => {
                        const student = data.profiles.find((item) => item.id === studentId);
                        const completed = data.lessonProgress.filter(
                          (item) => item.studentId === studentId && item.completed,
                        ).length;
                        return (
                          <tr key={studentId}>
                            <td>{student ? studentDisplayName(student, locale) : translate("nameMissing")}</td>
                            <td>{student?.schoolId}</td>
                            <td>
                              {pluralizeLessons(completed, locale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state">{translate("noGroupsYet")}</div>
        )}
      </div>
    </section>
  );
}

function SubmissionsTab() {
  const { profile } = useAuth();
  const { data, reviewSubmission } = useSchoolData();
  const { locale, translate } = useLocale();
  const { message, run, tone } = useActionMessage();
  const teacherCourseIds = new Set(
    data.courses
      .filter((course) => profile?.role !== "teacher" || course.teacherIds.includes(profile.id))
      .map((course) => course.id),
  );
  const submissions = data.submissions
    .map((submission) => {
      const assignment = data.assignments.find((item) => item.id === submission.assignmentId);
      const lesson = data.lessons.find((item) => item.id === assignment?.lessonId);
      const courseModule = data.modules.find((item) => item.id === lesson?.moduleId);
      return {
        ...submission,
        assignment,
        courseId: courseModule?.courseId,
        student: data.profiles.find((item) => item.id === submission.studentId),
      };
    })
    .filter((submission) => profile?.role !== "teacher" || teacherCourseIds.has(submission.courseId ?? ""));

  return (
    <section className="card">
      <div className="panel-title">
        <h2>{translate("homeworkReview")}</h2>
        <span className="badge">{submissions.length}</span>
      </div>
      <ActionMessage message={message} tone={tone} />
      <div className="grid">
        {submissions.length ? (
          submissions.map((submission) => (
            <article className="card compact" key={submission.id}>
              <div className="panel-title">
                <div>
                  <h3>{submission.assignment?.title ?? translate("homework")}</h3>
                  <p>{submission.student ? studentDisplayName(submission.student, locale) : translate("nameMissing")}</p>
                </div>
                <span className={`status ${submissionTone(submission.status)}`}>
                  {submissionLabel(submission.status, locale)}
                </span>
              </div>
              <p>{submission.textAnswer}</p>
              {submission.files.length ? (
                <div className="file-list">
                  <strong>{translate("attachedFiles")}</strong>
                  {submission.files.map((file) =>
                    file.url ? (
                      <a
                        className="file-link"
                        href={file.url}
                        key={file.path}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Download size={14} />
                        <span>{file.name}</span>
                        <span className="status ok">{translate("openFile")}</span>
                      </a>
                    ) : (
                      <span className="file-link" key={file.path}>
                        <Download size={14} />
                        <span>{file.name}</span>
                        <span className="status gray">{translate("file")}</span>
                      </span>
                    ),
                  )}
                </div>
              ) : null}
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  await run(() =>
                    reviewSubmission(submission.id, {
                      status: String(formData.get("status") ?? "accepted") as SubmissionStatus,
                      score: Number(formData.get("score") ?? 0),
                      reviewerComment: String(formData.get("reviewerComment") ?? ""),
                    }),
                  );
                }}
              >
                <label>
                  {translate("score")}
                  <input defaultValue={submission.score ?? 100} max={100} min={0} name="score" type="number" />
                </label>
                <label>
                  {translate("reviews")}
                  <select name="status" defaultValue={submission.status}>
                    <option value="accepted">{submissionLabel("accepted", locale)}</option>
                    <option value="needs_revision">{submissionLabel("needs_revision", locale)}</option>
                    <option value="in_review">{submissionLabel("in_review", locale)}</option>
                  </select>
                </label>
                <label>
                  {translate("comment")}
                  <textarea name="reviewerComment" defaultValue={submission.reviewerComment} />
                </label>
                <button className="button" type="submit">
                  <CheckCircle2 size={16} /> {translate("saveReview")}
                </button>
              </form>
            </article>
          ))
        ) : (
          <div className="empty-state">{translate("noSubmissionsForReview")}</div>
        )}
      </div>
    </section>
  );
}

function AccessTab() {
  const { profile } = useAuth();
  const { data, toggleLessonAccess } = useSchoolData();
  const { locale, translate } = useLocale();
  const { message, run, tone } = useActionMessage();
  const [targetType, setTargetType] = useState<LessonAccess["targetType"]>("group");
  const isTeacher = profile?.role === "teacher";
  const teacherCourseIds = new Set(
    isTeacher
      ? data.courses
          .filter((course) => course.teacherIds.includes(profile.id))
          .map((course) => course.id)
      : data.courses.map((course) => course.id),
  );
  const teacherGroupIds = new Set(
    data.groups
      .filter((group) => group.courseIds.some((courseId) => teacherCourseIds.has(courseId)))
      .map((group) => group.id),
  );
  const teacherStreamIds = new Set([
    ...data.courses
      .filter((course) => teacherCourseIds.has(course.id))
      .flatMap((course) => course.streamIds),
    ...data.groups
      .filter((group) => teacherGroupIds.has(group.id) && group.streamId)
      .map((group) => group.streamId),
  ]);
  const targetOptions =
    targetType === "student"
      ? data.profiles
          .filter((item) => item.role === "student")
          .filter(
            (student) =>
              !isTeacher ||
              student.assignedCourseIds.some((courseId) => teacherCourseIds.has(courseId)),
          )
          .map((student) => ({ id: student.id, title: studentDisplayName(student, locale) }))
      : targetType === "group"
        ? data.groups
            .filter((group) => !isTeacher || teacherGroupIds.has(group.id))
            .map((group) => ({ id: group.id, title: group.title }))
        : data.streams
            .filter((stream) => !isTeacher || teacherStreamIds.has(stream.id))
            .map((stream) => ({ id: stream.id, title: stream.title }));

  return (
    <section className="card">
      <h2>{translate("accessManagement")}</h2>
      <p>{translate("accessHelp")}</p>
      <ActionMessage message={message} tone={tone} />
      <div className="grid">
        {data.courses.map((course) => (
          <div className="lesson-strip" key={course.id}>
            <span>{course.title}</span>
            <span className="badge">{accessModeLabel(course.accessMode, locale)}</span>
          </div>
        ))}
        {data.lessons.map((lesson) => (
          <form
            className="access-strip"
            key={lesson.id}
            onSubmit={async (event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
            await run(() =>
              toggleLessonAccess(
                lesson.id,
                String(formData.get("targetId") ?? ""),
                formData.get("accessAction") === "open",
                targetType,
              ),
            );
            }}
          >
            <strong>{lesson.title}</strong>
            <label>
              {translate("accessTargetType")}
              <select
                name="targetType"
                onChange={(event) => setTargetType(event.target.value as LessonAccess["targetType"])}
                value={targetType}
              >
                <option value="student">{translate("student")}</option>
                <option value="group">{translate("group")}</option>
                <option value="stream">{translate("stream")}</option>
              </select>
            </label>
            <label>
              {translate("selectTarget")}
              <select name="targetId" required>
                <option value="">{translate("selectTarget")}</option>
                {targetOptions.map((target) => (
                  <option key={`${targetType}-${target.id}`} value={target.id}>
                    {target.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="access-actions">
              <button className="button" name="accessAction" type="submit" value="open">
                {translate("openAccess")}
              </button>
              <button className="secondary-button" name="accessAction" type="submit" value="close">
                {translate("closeAccess")}
              </button>
            </div>
          </form>
        ))}
      </div>
    </section>
  );
}

function StatsTab() {
  const { data } = useSchoolData();
  const { translate } = useLocale();
  const students = data.profiles.filter((item) => item.role === "student");
  const activeCourses = data.courses.filter((item) => item.active);
  const inReview = data.submissions.filter((item) => item.status === "in_review");
  const graded = data.submissions.filter((item) => item.score !== undefined);
  const average = graded.length
    ? Math.round(graded.reduce((sum, item) => sum + (item.score ?? 0), 0) / graded.length)
    : 0;

  const stats = [
    [translate("student"), students.length],
    [translate("active"), activeCourses.length],
    [translate("groupsStreams"), data.groups.length],
    [translate("reviews"), inReview.length],
    [translate("submittedWorks"), data.submissions.length],
    [translate("averageScore"), average],
    [translate("overdue"), data.submissions.filter((item) => item.status === "overdue").length],
    [translate("notifications"), data.notifications.length],
  ];

  return (
    <section className="card">
      <h2>{translate("statistics")}</h2>
      <div className="stat-row">
        {stats.map(([label, value]) => (
          <div className="card compact" key={label}>
            <span className="stat-value">{value}</span>
            <span className="muted">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsTab() {
  const { translate } = useLocale();
  const { schoolSettings, saveSchoolSettings } = useSchoolData();
  const { message, run, tone } = useActionMessage("settingsSaved");

  return (
    <section className="card">
      <div className="panel-title">
        <h2>{translate("settings")}</h2>
      </div>
      <ActionMessage message={message} tone={tone} />

      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const nextSettings: SchoolSettings = {
            name: String(formData.get("name") ?? ""),
            description: String(formData.get("description") ?? ""),
            email: String(formData.get("email") ?? ""),
            phone: String(formData.get("phone") ?? ""),
            telegram: String(formData.get("telegram") ?? ""),
          };
          await run(() => saveSchoolSettings(nextSettings));
        }}
      >
        <h3>{translate("schoolData")}</h3>
        <label>
          {translate("schoolTitle")}
          <input name="name" defaultValue={schoolSettings.name} />
        </label>
        <label>
          {translate("schoolSubtitle")}
          <textarea name="description" defaultValue={schoolSettings.description} />
        </label>
        <label>
          {translate("contactEmail")}
          <input name="email" defaultValue={schoolSettings.email} type="email" />
        </label>
        <label>
          {translate("phone")}
          <input name="phone" defaultValue={schoolSettings.phone} />
        </label>
        <label>
          Telegram
          <input name="telegram" defaultValue={schoolSettings.telegram} />
        </label>
        <button className="button" type="submit">
          {translate("save")}
        </button>
      </form>
    </section>
  );
}
