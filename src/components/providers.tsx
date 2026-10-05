"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  Assignment,
  AssignmentSubmission,
  Course,
  CourseModule,
  Lesson,
  LessonAccess,
  LessonMaterial,
  Locale,
  Profile,
  SchoolSettings,
  SchoolData,
  UserRole,
} from "@/types/domain";
import { initialSchoolData, mockPasswords } from "@/lib/mock-data";
import {
  getAuthRedirectUrl,
  getPasswordResetRedirectUrl,
  getSupabaseBrowserClient,
  hasSupabaseConfig,
} from "@/lib/supabase";
import { defaultLocale, localeStorageKey, locales, t } from "@/lib/i18n";
import * as schoolApi from "@/lib/school-api";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  translate: (key: string) => string;
};

type AuthContextValue = {
  profile: Profile | null;
  loading: boolean;
  authMode: "supabase" | "mock";
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (payload: {
    fullName: string;
    email: string;
    password: string;
    phone?: string;
  }) => Promise<{ error?: string; message?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string; message?: string }>;
  signOut: () => Promise<void>;
};

type DataContextValue = {
  data: SchoolData;
  dataLoading: boolean;
  dataError: string | null;
  schoolSettings: SchoolSettings;
  refreshData: () => Promise<void>;
  saveSchoolSettings: (settings: SchoolSettings) => Promise<void>;
  inviteUser: (payload: { fullName: string; email: string; role: "teacher" | "student" }) => Promise<void>;
  updateProfile: (id: string, patch: Partial<Profile>) => Promise<void>;
  createCourse: (
    draft: Pick<Course, "title" | "description"> &
      Partial<Pick<Course, "language" | "active" | "accessMode">>,
  ) => Promise<void>;
  updateCourse: (id: string, patch: Partial<Course>) => Promise<void>;
  archiveCourse: (courseId: string) => Promise<void>;
  restoreCourse: (courseId: string) => Promise<void>;
  deleteCourse: (courseId: string) => Promise<void>;
  cleanupTestCourses: () => Promise<void>;
  createModule: (
    draft: Pick<CourseModule, "courseId" | "title" | "description" | "order">,
  ) => Promise<void>;
  updateModule: (
    id: string,
    patch: Partial<Pick<CourseModule, "title" | "description" | "order">>,
  ) => Promise<void>;
  deleteModule: (moduleId: string) => Promise<void>;
  createLesson: (
    draft: Pick<
      Lesson,
      "moduleId" | "title" | "description" | "content" | "order" | "isOpenByDefault" | "hasAssignment"
    >,
  ) => Promise<void>;
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>;
  deleteLesson: (lessonId: string) => Promise<void>;
  uploadLessonMaterial: (
    draft: Pick<LessonMaterial, "lessonId" | "title" | "type" | "downloadable" | "order"> &
      Partial<Pick<LessonMaterial, "externalUrl" | "content">>,
    file?: File,
  ) => Promise<void>;
  updateLessonMaterial: (
    id: string,
    patch: Partial<
      Pick<LessonMaterial, "title" | "type" | "downloadable" | "order" | "externalUrl" | "content">
    >,
    file?: File,
  ) => Promise<void>;
  deleteLessonMaterial: (material: LessonMaterial) => Promise<void>;
  createAssignment: (
    draft: Pick<
      Assignment,
      | "lessonId"
      | "title"
      | "description"
      | "dueAt"
      | "allowTextAnswer"
      | "allowFileUpload"
      | "allowMultipleFiles"
      | "maxScore"
    >,
  ) => Promise<void>;
  deleteAssignment: (assignmentId: string) => Promise<void>;
  submitAssignment: (
    submission: Pick<AssignmentSubmission, "assignmentId" | "studentId" | "textAnswer">,
    files?: File[],
  ) => Promise<void>;
  reviewSubmission: (
    id: string,
    patch: Pick<AssignmentSubmission, "status" | "score" | "reviewerComment">,
  ) => Promise<void>;
  setLessonProgress: (lessonId: string, completed: boolean) => Promise<void>;
  createStream: (title: string) => Promise<void>;
  createGroup: (draft: { title: string; streamId?: string; curatorId?: string }) => Promise<void>;
  addStudentToGroup: (groupId: string, studentId: string) => Promise<void>;
  enrollStudentToCourse: (courseId: string, studentId: string) => Promise<void>;
  enrollStudentToCourseByIdentifier: (
    courseId: string,
    email: string,
    fullName: string,
    schoolId?: string,
  ) => Promise<void>;
  removeStudentFromCourse: (courseId: string, studentId: string) => Promise<void>;
  assignTeacherToCourse: (courseId: string, teacherId: string) => Promise<void>;
  removeTeacherFromCourse: (courseId: string, teacherId: string) => Promise<void>;
  enrollGroupToCourse: (courseId: string, groupId: string) => Promise<void>;
  toggleLessonAccess: (
    lessonId: string,
    targetId: string,
    isOpen: boolean,
    targetType?: LessonAccess["targetType"],
  ) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const AuthContext = createContext<AuthContextValue | null>(null);
const DataContext = createContext<DataContextValue | null>(null);

const dataStorageKey = "freecourse-school-data";
const profileStorageKey = "freecourse-current-profile";
const schoolSettingsStorageKey = "freecourse-school-settings";

export function AppProviders({ children }: { children: ReactNode }) {
  const supabaseMode = hasSupabaseConfig();
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [schoolSettings, setSchoolSettings] = useState<SchoolSettings>(
    schoolApi.defaultSchoolSettings,
  );
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [data, setData] = useState<SchoolData>(
    supabaseMode ? schoolApi.emptySchoolData : initialSchoolData,
  );

  async function loadSupabaseData() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setDataLoading(true);
    setDataError(null);
    try {
      const nextData = await schoolApi.getSchoolData(supabase);
      setData(nextData);
      setProfile((current) =>
        current ? (nextData.profiles.find((item) => item.id === current.id) ?? current) : current,
      );
    } catch (error) {
      setData(schoolApi.emptySchoolData);
      setDataError(error instanceof Error ? error.message : t("dataLoadFailed", locale));
    } finally {
      setDataLoading(false);
    }
  }

  async function loadSchoolSettings() {
    const savedSettings = window.localStorage.getItem(schoolSettingsStorageKey);
    if (savedSettings) {
      try {
        setSchoolSettings(
          schoolApi.normalizeSchoolSettings(JSON.parse(savedSettings) as SchoolSettings),
        );
      } catch {
        setSchoolSettings(schoolApi.defaultSchoolSettings);
      }
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const nextSettings = await schoolApi.getSchoolSettings(supabase);
      const normalizedSettings = schoolApi.normalizeSchoolSettings(nextSettings);
      setSchoolSettings(normalizedSettings);
      window.localStorage.setItem(schoolSettingsStorageKey, JSON.stringify(normalizedSettings));
    } catch {
      if (!savedSettings) {
        setSchoolSettings(schoolApi.defaultSchoolSettings);
      }
    }
  }

  useEffect(() => {
    const savedLocale = window.localStorage.getItem(localeStorageKey);
    const initialLocale =
      savedLocale && locales.includes(savedLocale as Locale)
        ? (savedLocale as Locale)
        : defaultLocale;
    setLocaleState(initialLocale);
    document.documentElement.lang = initialLocale;
    document.documentElement.removeAttribute("data-theme");

    void loadSchoolSettings();

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      supabase.auth
        .getUser()
        .then(async ({ data: userData, error }) => {
          if (error || !userData.user) {
            setProfile(null);
            setData(schoolApi.emptySchoolData);
            return;
          }
          const ensuredProfile = await schoolApi.ensureCurrentProfile(supabase, userData.user);
          setProfile(ensuredProfile);
          await loadSupabaseData();
        })
        .catch((error: unknown) => {
          setDataError(error instanceof Error ? error.message : t("profileLoadFailed", locale));
        })
        .finally(() => setLoading(false));
      return;
    }

    const savedData = window.localStorage.getItem(dataStorageKey);
    if (savedData) {
      try {
        setData(JSON.parse(savedData) as SchoolData);
      } catch {
        setData(initialSchoolData);
      }
    }

    const savedProfile = window.localStorage.getItem(profileStorageKey);
    if (savedProfile) {
      setProfile(JSON.parse(savedProfile) as Profile);
    }

    setLoading(false);
    // Initial client bootstrap should run once; auth/data reloads are handled by explicit mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && !supabaseMode) {
      window.localStorage.setItem(dataStorageKey, JSON.stringify(data));
    }
  }, [data, loading, supabaseMode]);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    window.localStorage.setItem(localeStorageKey, nextLocale);
    document.documentElement.lang = nextLocale;
  };

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const { error, data: authData } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) return { error: error.message };
      if (!authData.user) return { error: t("userNotFound", locale) };

      const ensuredProfile = await schoolApi.ensureCurrentProfile(supabase, authData.user);
      setProfile(ensuredProfile);
      await loadSupabaseData();
      return {};
    }

    if (mockPasswords[normalizedEmail] !== password) {
      return { error: t("invalidCredentials", locale) };
    }

    const foundProfile = data.profiles.find((item) => item.email === normalizedEmail);
    if (!foundProfile) return { error: t("userNotFound", locale) };

    setProfile(foundProfile);
    window.localStorage.setItem(profileStorageKey, JSON.stringify(foundProfile));
    return {};
  };

  const signUp: AuthContextValue["signUp"] = async ({ fullName, email, password, phone }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getSupabaseBrowserClient();

    if (supabase) {
      const { error, data: authData } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: { full_name: fullName, phone },
          emailRedirectTo: getAuthRedirectUrl(),
        },
      });

      if (error) return { error: error.message };
      if (!authData.user) return { error: t("confirmEmail", locale) };

      if (authData.session) {
        const newProfile = await schoolApi.ensureCurrentProfile(supabase, authData.user);
        setProfile(newProfile);
        await loadSupabaseData();
      }
      return { message: t("confirmRegistrationEmail", locale) };
    }

    if (data.profiles.some((item) => item.email === normalizedEmail)) {
      return { error: t("emailAlreadyRegistered", locale) };
    }

    mockPasswords[normalizedEmail] = password;
    const newProfile: Profile = {
      id: crypto.randomUUID(),
      fullName,
      email: normalizedEmail,
      phone,
      role: "student",
      groupIds: [],
      assignedCourseIds: [],
    };
    setData((current) => ({
      ...current,
      profiles: [...current.profiles, newProfile],
      notifications: [
        ...current.notifications,
        {
          id: crypto.randomUUID(),
          profileId: newProfile.id,
          title: t("registrationSuccess", locale),
          body: t("welcomeCabinet", locale),
          read: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setProfile(newProfile);
    window.localStorage.setItem(profileStorageKey, JSON.stringify(newProfile));
    return { message: t("confirmRegistrationEmail", locale) };
  };

  const resetPassword: AuthContextValue["resetPassword"] = async (email) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getPasswordResetRedirectUrl(),
      });
      return error ? { error: error.message } : { message: t("passwordResetSent", locale) };
    }

    return { message: t("localPasswordHint", locale) };
  };

  const signOut = async () => {
    await getSupabaseBrowserClient()?.auth.signOut();
    setProfile(null);
    if (supabaseMode) {
      setData(schoolApi.emptySchoolData);
    } else {
      window.localStorage.removeItem(profileStorageKey);
    }
  };

  const reloadAfterMutation = async () => {
    if (getSupabaseBrowserClient()) {
      await loadSupabaseData();
    }
  };

  const dataValue: DataContextValue = {
      data,
      dataLoading,
      dataError,
      schoolSettings,
      async refreshData() {
        await reloadAfterMutation();
      },
      async saveSchoolSettings(nextSettings) {
        const normalizedSettings = schoolApi.normalizeSchoolSettings({
          name: nextSettings.name.trim(),
          description: nextSettings.description.trim(),
          email: nextSettings.email?.trim(),
          phone: nextSettings.phone?.trim(),
          telegram: nextSettings.telegram?.trim(),
        });
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.saveSchoolSettings(supabase, normalizedSettings);
        }
        setSchoolSettings(normalizedSettings);
        window.localStorage.setItem(
          schoolSettingsStorageKey,
          JSON.stringify(normalizedSettings),
        );
      },
      async inviteUser(payload) {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          throw new Error(t("invitationsRequireSupabase", locale));
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          throw new Error(t("unauthorized", locale));
        }
        const response = await fetch("/api/admin/invitations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = (await response.json().catch(() => null)) as { code?: string } | null;
        if (!response.ok) {
          throw new Error(t(result?.code ?? "invitationFailed", locale));
        }
        await reloadAfterMutation();
      },
      async updateProfile(id, patch) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.updateProfile(supabase, id, patch);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        }));
        setProfile((current) => (current?.id === id ? { ...current, ...patch } : current));
      },
      async createCourse(draft) {
        const supabase = getSupabaseBrowserClient();
        const creatorTeacherId = profile?.role === "teacher" ? profile.id : undefined;
        if (supabase) {
          await schoolApi.createCourse(supabase, { ...draft, creatorTeacherId });
          await reloadAfterMutation();
          return;
        }
        const now = new Date().toISOString();
        const courseId = crypto.randomUUID();
        setData((current) => ({
          ...current,
          courses: [
            ...current.courses,
            {
              id: courseId,
              title: draft.title,
              description: draft.description,
              language: draft.language ?? "ru",
              active: draft.active ?? true,
              accessMode: draft.accessMode ?? "manual",
              groupIds: [],
              streamIds: [],
              teacherIds: creatorTeacherId ? [creatorTeacherId] : [],
              createdAt: now,
              updatedAt: now,
            },
          ],
        }));
      },
      async updateCourse(id, patch) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.updateCourse(supabase, id, patch);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          courses: current.courses.map((course) =>
            course.id === id ? { ...course, ...patch, updatedAt: new Date().toISOString() } : course,
          ),
        }));
      },
      async archiveCourse(courseId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.archiveCourse(supabase, courseId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          courses: current.courses.map((course) =>
            course.id === courseId ? { ...course, active: false, updatedAt: new Date().toISOString() } : course,
          ),
        }));
      },
      async restoreCourse(courseId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.restoreCourse(supabase, courseId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          courses: current.courses.map((course) =>
            course.id === courseId ? { ...course, active: true, updatedAt: new Date().toISOString() } : course,
          ),
        }));
      },
      async deleteCourse(courseId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.deleteCourse(supabase, courseId);
          await reloadAfterMutation();
          return;
        }
        const moduleIds = data.modules
          .filter((module) => module.courseId === courseId)
          .map((module) => module.id);
        const lessonIds = data.lessons
          .filter((lesson) => moduleIds.includes(lesson.moduleId))
          .map((lesson) => lesson.id);
        const assignmentIds = data.assignments
          .filter((assignment) => lessonIds.includes(assignment.lessonId))
          .map((assignment) => assignment.id);
        setData((current) => {
          return {
            ...current,
            courses: current.courses.filter((course) => course.id !== courseId),
            profiles: current.profiles.map((profile) => ({
              ...profile,
              assignedCourseIds: profile.assignedCourseIds.filter((id) => id !== courseId),
            })),
            groups: current.groups.map((group) => ({
              ...group,
              courseIds: group.courseIds.filter((id) => id !== courseId),
            })),
            modules: current.modules.filter((module) => module.courseId !== courseId),
            lessons: current.lessons.filter((lesson) => !lessonIds.includes(lesson.id)),
            materials: current.materials.filter((material) => !lessonIds.includes(material.lessonId)),
            assignments: current.assignments.filter(
              (assignment) => !lessonIds.includes(assignment.lessonId),
            ),
            submissions: current.submissions.filter(
              (submission) => !assignmentIds.includes(submission.assignmentId),
            ),
            lessonProgress: current.lessonProgress.filter(
              (progress) => !lessonIds.includes(progress.lessonId),
            ),
            lessonAccess: current.lessonAccess.filter((access) => !lessonIds.includes(access.lessonId)),
          };
        });
      },
      async cleanupTestCourses() {
        const testCourses = data.courses.filter(schoolApi.isTestCourse);
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await Promise.all(testCourses.map((course) => schoolApi.deleteCourse(supabase, course.id)));
          await reloadAfterMutation();
          return;
        }
        for (const course of testCourses) {
          await dataValue.deleteCourse(course.id);
        }
      },
      async createModule(draft) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.createModule(supabase, draft);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          modules: [...current.modules, { ...draft, id: crypto.randomUUID() }],
        }));
      },
      async updateModule(id, patch) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.updateModule(supabase, id, patch);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          modules: current.modules.map((module) =>
            module.id === id ? { ...module, ...patch } : module,
          ),
        }));
      },
      async deleteModule(moduleId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.deleteModule(supabase, moduleId);
          await reloadAfterMutation();
          return;
        }
        if (data.lessons.some((lesson) => lesson.moduleId === moduleId)) {
          throw new Error(t("deleteModuleHasLessons", locale));
        }
        setData((current) => {
          return {
            ...current,
            modules: current.modules.filter((module) => module.id !== moduleId),
          };
        });
      },
      async createLesson(draft) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.createLesson(supabase, draft);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          lessons: [...current.lessons, { ...draft, id: crypto.randomUUID() }],
        }));
      },
      async updateLesson(id, patch) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.updateLesson(supabase, id, patch);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          lessons: current.lessons.map((lesson) =>
            lesson.id === id ? { ...lesson, ...patch } : lesson,
          ),
        }));
      },
      async deleteLesson(lessonId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.deleteLesson(supabase, lessonId);
          await reloadAfterMutation();
          return;
        }
        const assignmentIds = data.assignments
          .filter((assignment) => assignment.lessonId === lessonId)
          .map((assignment) => assignment.id);
        if (data.submissions.some((submission) => assignmentIds.includes(submission.assignmentId))) {
          throw new Error(t("deleteLessonHasSubmissions", locale));
        }
        if (data.lessonProgress.some((progress) => progress.lessonId === lessonId)) {
          throw new Error(t("deleteLessonHasProgress", locale));
        }
        setData((current) => {
          return {
            ...current,
            lessons: current.lessons.filter((lesson) => lesson.id !== lessonId),
            materials: current.materials.filter((material) => material.lessonId !== lessonId),
            assignments: current.assignments.filter((assignment) => assignment.lessonId !== lessonId),
            lessonAccess: current.lessonAccess.filter((access) => access.lessonId !== lessonId),
          };
        });
      },
      async uploadLessonMaterial(draft, file) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.uploadLessonMaterial(supabase, draft, file);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          materials: [
            ...current.materials,
            {
              ...draft,
              id: crypto.randomUUID(),
              filePath: file?.name ?? draft.title,
              fileSize: file ? `${Math.round(file.size / 1024)} KB` : "0 KB",
              externalUrl: draft.externalUrl,
              content: draft.content,
            },
          ],
        }));
      },
      async updateLessonMaterial(id, patch, file) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.updateLessonMaterial(supabase, id, patch, file);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          materials: current.materials.map((material) =>
            material.id === id
              ? {
                  ...material,
                  ...patch,
                  filePath: file?.name ?? material.filePath,
                  fileSize: file ? `${Math.round(file.size / 1024)} KB` : material.fileSize,
                }
              : material,
          ),
        }));
      },
      async deleteLessonMaterial(material) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.deleteLessonMaterial(supabase, material);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          materials: current.materials.filter((item) => item.id !== material.id),
        }));
      },
      async createAssignment(draft) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.createAssignment(supabase, draft);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          assignments: [...current.assignments, { ...draft, id: crypto.randomUUID() }],
        }));
      },
      async deleteAssignment(assignmentId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.deleteAssignment(supabase, assignmentId);
          await reloadAfterMutation();
          return;
        }
        if (data.submissions.some((submission) => submission.assignmentId === assignmentId)) {
          throw new Error(t("deleteAssignmentHasSubmissions", locale));
        }
        setData((current) => {
          return {
            ...current,
            assignments: current.assignments.filter((assignment) => assignment.id !== assignmentId),
          };
        });
      },
      async submitAssignment(submissionDraft, files = []) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.submitAssignment(supabase, submissionDraft, files);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          submissions: [
            ...current.submissions.filter(
              (item) =>
                item.assignmentId !== submissionDraft.assignmentId ||
                item.studentId !== submissionDraft.studentId,
            ),
            {
              ...submissionDraft,
              id: crypto.randomUUID(),
              fileNames: files.map((file) => file.name),
              files: files.map((file) => ({
                name: file.name,
                path: file.name,
              })),
              status: "in_review",
              submittedAt: new Date().toISOString(),
            },
          ],
          notifications: [
            ...current.notifications,
            {
              id: crypto.randomUUID(),
              profileId: submissionDraft.studentId,
              title: t("homeworkSubmitted", locale),
              body: t("workSentForReview", locale),
              read: false,
              createdAt: new Date().toISOString(),
            },
          ],
        }));
      },
      async reviewSubmission(id, patch) {
        const supabase = getSupabaseBrowserClient();
        if (supabase && profile) {
          await schoolApi.reviewSubmission(supabase, profile.id, id, patch);
          await reloadAfterMutation();
          return;
        }
        setData((current) => {
          const reviewedSubmission = current.submissions.find((item) => item.id === id);
          return {
            ...current,
            submissions: current.submissions.map((item) =>
              item.id === id
                ? { ...item, ...patch, reviewedAt: new Date().toISOString() }
                : item,
            ),
            notifications: reviewedSubmission
              ? [
                  ...current.notifications,
                  {
                    id: crypto.randomUUID(),
                    profileId: reviewedSubmission.studentId,
                    title:
                      patch.status === "needs_revision"
                        ? t("workNeedsRevision", locale)
                        : t("homeworkReviewed", locale),
                    body:
                      patch.status === "needs_revision"
                        ? t("reviseComment", locale)
                        : `${t("scoreSet", locale)} ${patch.score ?? 0}.`,
                    read: false,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : current.notifications,
          };
        });
      },
      async setLessonProgress(lessonId, completed) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.setCurrentStudentLessonProgress(supabase, lessonId, completed);
          await reloadAfterMutation();
          return;
        }
        if (!profile || profile.role !== "student") {
          throw new Error(t("unauthorized", locale));
        }
        setData((current) => {
          const existing = current.lessonProgress.find(
            (item) => item.lessonId === lessonId && item.studentId === profile.id,
          );
          const nextProgress = {
            id: existing?.id ?? crypto.randomUUID(),
            lessonId,
            studentId: profile.id,
            completed,
            completedAt: completed ? new Date().toISOString() : undefined,
          };
          return {
            ...current,
            lessonProgress: [
              ...current.lessonProgress.filter((item) => item !== existing),
              nextProgress,
            ],
          };
        });
      },
      async createStream(title) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.createStream(supabase, title);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          streams: [...current.streams, { id: crypto.randomUUID(), title, startsAt: "" }],
        }));
      },
      async createGroup(draft) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.createGroup(supabase, draft);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          groups: [
            ...current.groups,
            {
              id: crypto.randomUUID(),
              title: draft.title,
              streamId: draft.streamId ?? "",
              curatorId: draft.curatorId ?? "",
              studentIds: [],
              courseIds: [],
            },
          ],
        }));
      },
      async addStudentToGroup(groupId, studentId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.addStudentToGroup(supabase, groupId, studentId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          groups: current.groups.map((group) =>
            group.id === groupId
              ? { ...group, studentIds: [...new Set([...group.studentIds, studentId])] }
              : group,
          ),
        }));
      },
      async enrollStudentToCourse(courseId, studentId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.enrollStudentToCourse(supabase, courseId, studentId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) =>
            item.id === studentId
              ? { ...item, assignedCourseIds: [...new Set([...item.assignedCourseIds, courseId])] }
              : item,
            ),
        }));
      },
      async enrollStudentToCourseByIdentifier(courseId, email, fullName, schoolId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.enrollStudentToCourseByIdentifier(supabase, courseId, email, fullName, schoolId);
          await reloadAfterMutation();
          return;
        }
        const student = data.profiles.find(
          (item) =>
            item.role === "student" &&
            (item.email.toLowerCase() === email.toLowerCase() || (schoolId && item.schoolId === schoolId)),
        );
        if (!student) {
          throw new Error(t("studentMustExist", locale));
        }
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) =>
            item.id === student.id
              ? {
                  ...item,
                  fullName: schoolApi.isMissingOrDemoStudentName(item.fullName) ? fullName : item.fullName,
                  schoolId: schoolId || item.schoolId,
                  assignedCourseIds: [...new Set([...item.assignedCourseIds, courseId])],
                }
              : item,
          ),
        }));
      },
      async removeStudentFromCourse(courseId, studentId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.removeStudentFromCourse(supabase, courseId, studentId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) =>
            item.id === studentId
              ? { ...item, assignedCourseIds: item.assignedCourseIds.filter((id) => id !== courseId) }
              : item,
          ),
        }));
      },
      async assignTeacherToCourse(courseId, teacherId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.assignTeacherToCourse(supabase, courseId, teacherId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          courses: current.courses.map((course) =>
            course.id === courseId
              ? { ...course, teacherIds: [...new Set([...course.teacherIds, teacherId])] }
              : course,
          ),
          profiles: current.profiles.map((item) =>
            item.id === teacherId
              ? { ...item, assignedCourseIds: [...new Set([...item.assignedCourseIds, courseId])] }
              : item,
          ),
        }));
      },
      async removeTeacherFromCourse(courseId, teacherId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.removeTeacherFromCourse(supabase, courseId, teacherId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          courses: current.courses.map((course) =>
            course.id === courseId
              ? { ...course, teacherIds: course.teacherIds.filter((id) => id !== teacherId) }
              : course,
          ),
          profiles: current.profiles.map((item) =>
            item.id === teacherId
              ? {
                  ...item,
                  assignedCourseIds: item.assignedCourseIds.filter((id) => id !== courseId),
                }
              : item,
          ),
        }));
      },
      async enrollGroupToCourse(courseId, groupId) {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.enrollGroupToCourse(supabase, courseId, groupId);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          groups: current.groups.map((group) =>
            group.id === groupId
              ? { ...group, courseIds: [...new Set([...group.courseIds, courseId])] }
              : group,
          ),
        }));
      },
      async toggleLessonAccess(lessonId, targetId, isOpen, targetType = "group") {
        const supabase = getSupabaseBrowserClient();
        if (supabase) {
          await schoolApi.toggleLessonAccess(supabase, lessonId, targetType, targetId, isOpen);
          await reloadAfterMutation();
          return;
        }
        setData((current) => ({
          ...current,
          lessonAccess: [
            ...current.lessonAccess.filter(
              (item) => item.lessonId !== lessonId || item.targetId !== targetId,
            ),
            {
              id: crypto.randomUUID(),
              lessonId,
              targetType,
              targetId,
              isOpen,
            },
          ],
        }));
      },
  };

  const localeValue = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      translate: (key) => t(key, locale),
    }),
    [locale],
  );

  const authValue: AuthContextValue = {
    profile,
    loading,
    authMode: supabaseMode ? "supabase" : "mock",
    signIn,
    signUp,
    resetPassword,
    signOut,
  };

  return (
    <LocaleContext.Provider value={localeValue}>
      <DataContext.Provider value={dataValue}>
        <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
      </DataContext.Provider>
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside AppProviders");
  }
  return context;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AppProviders");
  }
  return context;
}

export function useSchoolData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useSchoolData must be used inside AppProviders");
  }
  return context;
}

export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const router = useRouter();
  const { loading, profile } = useAuth();
  const { translate } = useLocale();

  useEffect(() => {
    if (!loading && !profile) {
      router.replace("/login");
    }
  }, [loading, profile, router]);

  if (loading) {
    return <main className="page-shell">{translate("loading")}</main>;
  }

  if (!profile) {
    return <main className="page-shell">{translate("redirectingToLogin")}</main>;
  }

  if (roles && !roles.includes(profile.role)) {
    return (
      <main className="page-shell">
        <div className="empty-state">{translate("noAccess")}</div>
      </main>
    );
  }

  return children;
}
