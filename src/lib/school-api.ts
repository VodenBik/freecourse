import type { SupabaseClient, User } from "@supabase/supabase-js";
import type {
  AccessMode,
  Assignment,
  AssignmentSubmission,
  Course,
  CourseLanguage,
  CourseModule,
  Lesson,
  LessonAccess,
  LessonMaterial,
  MaterialType,
  Notification,
  Profile,
  SchoolSettings,
  SchoolData,
  Stream,
  StudyGroup,
  SubmissionStatus,
  UserRole,
  Locale,
} from "@/types/domain";
import { t } from "@/lib/i18n";

type Row = Record<string, unknown>;

export const assignmentSubmissionMaxFileSize = 20 * 1024 * 1024;
export const assignmentSubmissionAllowedExtensions = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "jpg",
  "jpeg",
  "png",
  "webp",
  "zip",
];

const testCourseMarkers = ["mimo", "мимо", "тестовый", "test", "demo", "демо"];

export function isTestCourse(course: Pick<Course, "title" | "description">) {
  const searchable = `${course.title} ${course.description}`.toLowerCase();
  return testCourseMarkers.some((marker) => searchable.includes(marker));
}

export function isMissingOrDemoStudentName(value?: string) {
  const normalized = (value ?? "").trim().toLowerCase();
  return !normalized || normalized === "тестовый ученик" || normalized === "test student";
}

export function studentDisplayName(
  profile: Pick<Profile, "fullName">,
  locale: Locale = "en",
) {
  return isMissingOrDemoStudentName(profile.fullName) ? t("nameMissing", locale) : profile.fullName;
}

export const emptySchoolData: SchoolData = {
  profiles: [],
  streams: [],
  groups: [],
  courses: [],
  modules: [],
  lessons: [],
  materials: [],
  assignments: [],
  submissions: [],
  lessonAccess: [],
  lessonProgress: [],
  notifications: [],
};

export const defaultSchoolSettings: SchoolSettings = {
  name: "",
  description: "",
  email: "",
  phone: "",
  telegram: "",
};

const schoolSettingsKey = "school_public";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSchoolSettings(settings: SchoolSettings): SchoolSettings {
  return {
    name: settings.name ?? "",
    description: settings.description ?? "",
    email: settings.email ?? "",
    phone: settings.phone ?? "",
    telegram: settings.telegram ?? "",
  };
}

function mapSchoolSettings(value: unknown): SchoolSettings {
  const row = value && typeof value === "object" ? (value as Row) : {};
  return normalizeSchoolSettings({
    name: asString(row.name, defaultSchoolSettings.name),
    description: asString(row.description, defaultSchoolSettings.description),
    email: asString(row.email),
    phone: asString(row.phone),
    telegram: asString(row.telegram),
  });
}

function bytesToLabel(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function fileNameFromPath(path: string) {
  return path.split("/").pop() ?? path;
}

function sanitizeFileName(name: string) {
  return name.trim().replace(/[^\w.\-а-яА-ЯёЁ]+/g, "-").replace(/-+/g, "-") || "file";
}

function fileExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function assertAssignmentFile(file: File) {
  if (file.size > assignmentSubmissionMaxFileSize) {
    throw new Error("The file must not exceed 20 MB.");
  }

  if (!assignmentSubmissionAllowedExtensions.includes(fileExtension(file.name))) {
    throw new Error("This file type is not supported.");
  }
}

function assertNoError(error: { message: string } | null, context: string) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

async function selectRows(supabase: SupabaseClient, table: string, query = "*") {
  const { data, error } = await supabase.from(table).select(query);
  assertNoError(error, `Could not load the ${table} table`);
  return (data ?? []) as unknown as Row[];
}

function mapProfile(row: Row, groupIds: string[], assignedCourseIds: string[]): Profile {
  return {
    id: asString(row.id),
    fullName: asString(row.full_name, "Name not provided"),
    email: asString(row.email),
    phone: asOptionalString(row.phone),
    telegram: asOptionalString(row.telegram),
    schoolId: asOptionalString(row.school_id),
    role: asString(row.role, "student") as UserRole,
    groupIds,
    assignedCourseIds,
  };
}

function mapCourse(row: Row, groupIds: string[], streamIds: string[], teacherIds: string[]): Course {
  return {
    id: asString(row.id),
    title: asString(row.title),
    description: asString(row.description),
    language: asString(row.language, "ru") as CourseLanguage,
    active: asBoolean(row.is_active, true),
    accessMode: asString(row.access_mode, "manual") as AccessMode,
    accessStartsAt: asOptionalString(row.access_starts_at),
    accessEndsAt: asOptionalString(row.access_ends_at),
    groupIds,
    streamIds,
    teacherIds,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function mapModule(row: Row): CourseModule {
  return {
    id: asString(row.id),
    courseId: asString(row.course_id),
    title: asString(row.title),
    description: asString(row.description),
    order: asNumber(row.sort_order),
  };
}

function mapLesson(row: Row): Lesson {
  return {
    id: asString(row.id),
    moduleId: asString(row.module_id),
    title: asString(row.title),
    description: asString(row.description),
    content: asString(row.content),
    order: asNumber(row.sort_order),
    isOpenByDefault: asBoolean(row.is_open_by_default),
    hasAssignment: asBoolean(row.has_assignment),
  };
}

function mapMaterial(row: Row): LessonMaterial {
  return {
    id: asString(row.id),
    lessonId: asString(row.lesson_id),
    title: asString(row.title),
    type: asString(row.material_type, "text") as MaterialType,
    filePath: asString(row.file_path),
    fileSize: bytesToLabel(asNumber(row.file_size)),
    externalUrl: asOptionalString(row.external_url),
    content: asOptionalString(row.content),
    downloadable: asBoolean(row.is_downloadable),
    order: asNumber(row.sort_order),
  };
}

function mapAssignment(row: Row): Assignment {
  return {
    id: asString(row.id),
    lessonId: asString(row.lesson_id),
    title: asString(row.title),
    description: asString(row.description),
    dueAt: asOptionalString(row.due_at),
    allowTextAnswer: asBoolean(row.allow_text_answer, true),
    allowFileUpload: asBoolean(row.allow_file_upload),
    allowMultipleFiles: asBoolean(row.allow_multiple_files),
    maxScore: asNumber(row.max_score, 100),
  };
}

function mapNotification(row: Row): Notification {
  return {
    id: asString(row.id),
    profileId: asString(row.profile_id),
    title: asString(row.title),
    body: asString(row.body),
    read: asBoolean(row.is_read),
    createdAt: asString(row.created_at),
  };
}

export async function getCurrentProfile(supabase: SupabaseClient) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  assertNoError(userError, "Could not load the user");
  const user = userData.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  assertNoError(error, "Could not load the profile");
  if (!data) return null;

  return mapProfile(data as Row, [], []);
}

export async function ensureCurrentProfile(supabase: SupabaseClient, user: User) {
  const existing = await getCurrentProfile(supabase);
  if (existing) return existing;

  const email = user.email ?? "";
  const role: UserRole = "student";
  const fullName =
    asString(user.user_metadata?.full_name) ||
    asString(user.user_metadata?.name) ||
    "Name not provided";

  const payload = {
    id: user.id,
    full_name: fullName,
    email,
    phone: asOptionalString(user.user_metadata?.phone),
    role,
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(payload)
    .select("*")
    .single();
  assertNoError(error, "Could not create the profile");
  return mapProfile(data as Row, [], []);
}

export async function getSchoolData(supabase: SupabaseClient): Promise<SchoolData> {
  const [
    profileRows,
    streamRows,
    groupRows,
    groupMemberRows,
    courseRows,
    courseGroupRows,
    courseStreamRows,
    courseEnrollmentRows,
    courseStaffRows,
    moduleRows,
    lessonRows,
    materialRows,
    assignmentRows,
    submissionRows,
    gradeRows,
    commentRows,
    accessRows,
    progressRows,
    notificationRows,
  ] = await Promise.all([
    selectRows(supabase, "profiles"),
    selectRows(supabase, "streams"),
    selectRows(supabase, "groups"),
    selectRows(supabase, "group_members"),
    selectRows(supabase, "courses"),
    selectRows(supabase, "course_groups"),
    selectRows(supabase, "course_streams"),
    selectRows(supabase, "course_enrollments"),
    selectRows(supabase, "course_staff"),
    selectRows(supabase, "modules"),
    selectRows(supabase, "lessons"),
    selectRows(supabase, "lesson_materials"),
    selectRows(supabase, "assignments"),
    selectRows(supabase, "assignment_submissions"),
    selectRows(supabase, "grades"),
    selectRows(supabase, "comments"),
    selectRows(supabase, "lesson_access"),
    selectRows(supabase, "lesson_progress"),
    selectRows(supabase, "notifications"),
  ]);

  const groupIdsByStudent = new Map<string, string[]>();
  for (const row of groupMemberRows) {
    const studentId = asString(row.student_id);
    const groupId = asString(row.group_id);
    groupIdsByStudent.set(studentId, [...(groupIdsByStudent.get(studentId) ?? []), groupId]);
  }

  const coursesByGroup = new Map<string, string[]>();
  for (const row of [...courseGroupRows, ...courseEnrollmentRows.filter((item) => item.group_id)]) {
    const groupId = asString(row.group_id);
    const courseId = asString(row.course_id);
    coursesByGroup.set(groupId, [...(coursesByGroup.get(groupId) ?? []), courseId]);
  }

  const directCoursesByStudent = new Map<string, string[]>();
  for (const row of courseEnrollmentRows.filter((item) => item.student_id)) {
    const studentId = asString(row.student_id);
    const courseId = asString(row.course_id);
    directCoursesByStudent.set(studentId, [
      ...(directCoursesByStudent.get(studentId) ?? []),
      courseId,
    ]);
  }

  const staffCoursesByProfile = new Map<string, string[]>();
  for (const row of courseStaffRows) {
    const profileId = asString(row.profile_id);
    const courseId = asString(row.course_id);
    staffCoursesByProfile.set(profileId, [
      ...(staffCoursesByProfile.get(profileId) ?? []),
      courseId,
    ]);
  }

  const profiles = profileRows.map((row) => {
    const id = asString(row.id);
    const groupIds = groupIdsByStudent.get(id) ?? [];
    const groupCourseIds = groupIds.flatMap((groupId) => coursesByGroup.get(groupId) ?? []);
    const directCourseIds = directCoursesByStudent.get(id) ?? [];
    const staffCourseIds = staffCoursesByProfile.get(id) ?? [];
    return mapProfile(row, groupIds, [
      ...new Set([...groupCourseIds, ...directCourseIds, ...staffCourseIds]),
    ]);
  });

  const streams: Stream[] = streamRows.map((row) => ({
    id: asString(row.id),
    title: asString(row.title),
    startsAt: asString(row.starts_at),
    endsAt: asOptionalString(row.ends_at),
  }));

  const groups: StudyGroup[] = groupRows.map((row) => {
    const id = asString(row.id);
    const studentIds = groupMemberRows
      .filter((member) => asString(member.group_id) === id)
      .map((member) => asString(member.student_id));
    return {
      id,
      title: asString(row.title),
      streamId: asString(row.stream_id),
      curatorId: asString(row.curator_id),
      studentIds,
      courseIds: coursesByGroup.get(id) ?? [],
    };
  });

  const courses = courseRows.map((row) => {
    const id = asString(row.id);
    const groupIds = courseGroupRows
      .filter((item) => asString(item.course_id) === id)
      .map((item) => asString(item.group_id));
    const enrolledGroupIds = courseEnrollmentRows
      .filter((item) => asString(item.course_id) === id && item.group_id)
      .map((item) => asString(item.group_id));
    const streamIds = courseStreamRows
      .filter((item) => asString(item.course_id) === id)
      .map((item) => asString(item.stream_id));
    const teacherIds = courseStaffRows
      .filter((item) => asString(item.course_id) === id && asString(item.role) === "teacher")
      .map((item) => asString(item.profile_id));
    return mapCourse(row, [...new Set([...groupIds, ...enrolledGroupIds])], streamIds, teacherIds);
  });

  const gradesBySubmission = new Map(gradeRows.map((row) => [asString(row.submission_id), row]));
  const commentsBySubmission = new Map<string, Row>();
  for (const row of commentRows) {
    commentsBySubmission.set(asString(row.submission_id), row);
  }

  const submissionFilePaths = [
    ...new Set(
      submissionRows.flatMap((row) =>
        Array.isArray(row.file_paths) ? row.file_paths.map(String).filter(Boolean) : [],
      ),
    ),
  ];
  const signedUrlByPath = new Map<string, string>();
  if (submissionFilePaths.length) {
    const { data: signedFiles, error: signedFilesError } = await supabase.storage
      .from("assignment-submissions")
      .createSignedUrls(submissionFilePaths, 60 * 60);
    assertNoError(signedFilesError, "Could not prepare submission file links");
    (signedFiles ?? []).forEach((file, index) => {
      if (file.signedUrl) {
        signedUrlByPath.set(submissionFilePaths[index], file.signedUrl);
      }
    });
  }

  const submissions: AssignmentSubmission[] = submissionRows.map((row) => {
    const id = asString(row.id);
    const filePaths = Array.isArray(row.file_paths) ? row.file_paths.map(String) : [];
    const grade = gradesBySubmission.get(id);
    const comment = commentsBySubmission.get(id);
    return {
      id,
      assignmentId: asString(row.assignment_id),
      studentId: asString(row.student_id),
      textAnswer: asString(row.text_answer),
      fileNames: filePaths.map(fileNameFromPath),
      files: filePaths.map((path) => ({
        name: fileNameFromPath(path),
        path,
        url: signedUrlByPath.get(path),
      })),
      status: asString(row.status, "submitted") as SubmissionStatus,
      score: grade ? asNumber(grade.score) : undefined,
      reviewerComment: comment ? asString(comment.body) : undefined,
      submittedAt: asOptionalString(row.submitted_at),
      reviewedAt: asOptionalString(row.reviewed_at),
    };
  });

  const lessonMaterialFilePaths = [
    ...new Set(
      materialRows
        .map((row) => asString(row.file_path))
        .filter(Boolean),
    ),
  ];
  const signedMaterialUrlByPath = new Map<string, string>();
  if (lessonMaterialFilePaths.length) {
    const { data: signedMaterials, error: signedMaterialsError } = await supabase.storage
      .from("lesson-materials")
      .createSignedUrls(lessonMaterialFilePaths, 60 * 60);
    assertNoError(signedMaterialsError, "Could not prepare material file links");
    (signedMaterials ?? []).forEach((file, index) => {
      if (file.signedUrl) {
        signedMaterialUrlByPath.set(lessonMaterialFilePaths[index], file.signedUrl);
      }
    });
  }

  const materials: LessonMaterial[] = materialRows.map((row) => {
    const material = mapMaterial(row);
    const filePath = material.filePath;
    return { ...material, url: filePath ? signedMaterialUrlByPath.get(filePath) : undefined };
  });

  return {
    profiles,
    streams,
    groups,
    courses,
    modules: moduleRows.map(mapModule),
    lessons: lessonRows.map(mapLesson),
    materials,
    assignments: assignmentRows.map(mapAssignment),
    submissions,
    lessonAccess: accessRows.map((row) => ({
      id: asString(row.id),
      lessonId: asString(row.lesson_id),
      targetType: asString(row.target_type, "group") as LessonAccess["targetType"],
      targetId: asString(row.target_id),
      isOpen: asBoolean(row.is_open),
      startsAt: asOptionalString(row.starts_at),
      endsAt: asOptionalString(row.ends_at),
    })),
    lessonProgress: progressRows.map((row) => ({
      id: asString(row.id),
      lessonId: asString(row.lesson_id),
      studentId: asString(row.student_id),
      completed: asBoolean(row.completed),
      completedAt: asOptionalString(row.completed_at),
    })),
    notifications: notificationRows.map(mapNotification),
  };
}

export async function getSchoolSettings(supabase: SupabaseClient): Promise<SchoolSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", schoolSettingsKey)
    .maybeSingle();
  assertNoError(error, "Could not load organization data");
  return mapSchoolSettings((data as Row | null)?.value);
}

export async function saveSchoolSettings(
  supabase: SupabaseClient,
  settings: SchoolSettings,
) {
  const { error } = await supabase.from("settings").upsert(
    {
      key: schoolSettingsKey,
      value: settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  assertNoError(error, "Could not save organization data");
}

export async function createCourse(
  supabase: SupabaseClient,
  draft: Pick<Course, "title" | "description"> &
    Partial<Pick<Course, "language" | "active" | "accessMode">>,
) {
  const { data, error } = await supabase.rpc("create_course_for_current_user", {
    p_title: draft.title,
    p_description: draft.description,
    p_language: draft.language ?? "ru",
    p_is_active: draft.active ?? true,
    p_access_mode: draft.accessMode ?? "manual",
  });
  assertNoError(error, "Could not create the course");
  return asString(data && typeof data === "object" ? (data as Row).id : data);
}

export async function updateCourse(supabase: SupabaseClient, id: string, patch: Partial<Course>) {
  const { error } = await supabase
    .from("courses")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.language !== undefined ? { language: patch.language } : {}),
      ...(patch.active !== undefined ? { is_active: patch.active } : {}),
      ...(patch.accessMode !== undefined ? { access_mode: patch.accessMode } : {}),
      ...(patch.accessStartsAt !== undefined ? { access_starts_at: patch.accessStartsAt || null } : {}),
      ...(patch.accessEndsAt !== undefined ? { access_ends_at: patch.accessEndsAt || null } : {}),
    })
    .eq("id", id);
  assertNoError(error, "Could not update the course");
}

async function getCourseLessonIds(supabase: SupabaseClient, courseId: string) {
  const { data, error } = await supabase
    .from("modules")
    .select("lessons(id)")
    .eq("course_id", courseId);
  assertNoError(error, "Could not check the course lessons");
  return ((data ?? []) as Array<{ lessons?: Array<{ id: string }> }>).flatMap((module) =>
    (module.lessons ?? []).map((lesson) => lesson.id),
  );
}

async function getLessonAssignmentIds(supabase: SupabaseClient, lessonIds: string[]) {
  if (!lessonIds.length) return [];
  const { data, error } = await supabase
    .from("assignments")
    .select("id")
    .in("lesson_id", lessonIds);
  assertNoError(error, "Could not check the assignments");
  return ((data ?? []) as Array<{ id: string }>).map((assignment) => assignment.id);
}

async function hasRowsByIds(
  supabase: SupabaseClient,
  table: string,
  column: string,
  ids: string[],
) {
  if (!ids.length) return false;
  const { data, error } = await supabase.from(table).select("id").in(column, ids).limit(1);
  assertNoError(error, `Could not check the ${table} table`);
  return Boolean(data?.length);
}

export async function archiveCourse(supabase: SupabaseClient, courseId: string) {
  await updateCourse(supabase, courseId, { active: false });
}

export async function restoreCourse(supabase: SupabaseClient, courseId: string) {
  await updateCourse(supabase, courseId, { active: true });
}

export async function deleteCourse(supabase: SupabaseClient, courseId: string) {
  const lessonIds = await getCourseLessonIds(supabase, courseId);
  const assignmentIds = await getLessonAssignmentIds(supabase, lessonIds);

  if (lessonIds.length) {
    const { data: materials, error: materialsError } = await supabase
      .from("lesson_materials")
      .select("file_path")
      .in("lesson_id", lessonIds);
    assertNoError(materialsError, "Could not check the course materials");
    const filePaths = ((materials ?? []) as Array<{ file_path?: string | null }>)
      .map((material) => material.file_path)
      .filter((path): path is string => Boolean(path));
    if (filePaths.length) {
      const { error: storageError } = await supabase.storage
        .from("lesson-materials")
        .remove(filePaths);
      assertNoError(storageError, "Could not delete course material files");
    }
  }

  if (assignmentIds.length) {
    const { data: submissions, error: submissionsError } = await supabase
      .from("assignment_submissions")
      .select("file_paths")
      .in("assignment_id", assignmentIds);
    assertNoError(submissionsError, "Could not check course submission files");
    const submissionFilePaths = ((submissions ?? []) as Array<{ file_paths?: string[] | null }>)
      .flatMap((submission) => submission.file_paths ?? [])
      .filter((path): path is string => Boolean(path));
    if (submissionFilePaths.length) {
      const { error: submissionStorageError } = await supabase.storage
        .from("assignment-submissions")
        .remove(submissionFilePaths);
      assertNoError(submissionStorageError, "Could not delete course submission files");
    }
  }

  const { error } = await supabase.rpc("delete_course_deep", { p_course_id: courseId });
  assertNoError(error, "Could not delete the course");
}
export async function createModule(
  supabase: SupabaseClient,
  draft: Pick<CourseModule, "courseId" | "title" | "description" | "order">,
) {
  const { error } = await supabase.from("modules").insert({
    course_id: draft.courseId,
    title: draft.title,
    description: draft.description,
    sort_order: draft.order,
  });
  assertNoError(error, "Could not create the module");
}

export async function updateModule(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<CourseModule, "title" | "description" | "order">>,
) {
  const { error } = await supabase
    .from("modules")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
    })
    .eq("id", id);
  assertNoError(error, "Could not update the module");
}

export async function deleteModule(supabase: SupabaseClient, moduleId: string) {
  const { data: lessons, error: lessonsError } = await supabase
    .from("lessons")
    .select("id")
    .eq("module_id", moduleId)
    .limit(1);
  assertNoError(lessonsError, "Could not check the module lessons");
  if (lessons?.length) {
    throw new Error("Delete all lessons in this module first.");
  }

  const { error } = await supabase.from("modules").delete().eq("id", moduleId);
  assertNoError(error, "Could not delete the module");
}

export async function createLesson(
  supabase: SupabaseClient,
  draft: Pick<Lesson, "moduleId" | "title" | "description" | "content" | "order" | "isOpenByDefault" | "hasAssignment">,
) {
  const { error } = await supabase.from("lessons").insert({
    module_id: draft.moduleId,
    title: draft.title,
    description: draft.description,
    content: draft.content,
    sort_order: draft.order,
    is_open_by_default: draft.isOpenByDefault,
    has_assignment: draft.hasAssignment,
  });
  assertNoError(error, "Could not create the lesson");
}

export async function updateLesson(supabase: SupabaseClient, id: string, patch: Partial<Lesson>) {
  const { error } = await supabase
    .from("lessons")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
      ...(patch.isOpenByDefault !== undefined ? { is_open_by_default: patch.isOpenByDefault } : {}),
      ...(patch.hasAssignment !== undefined ? { has_assignment: patch.hasAssignment } : {}),
    })
    .eq("id", id);
  assertNoError(error, "Could not update the lesson");
}

export async function deleteLesson(supabase: SupabaseClient, lessonId: string) {
  const assignmentIds = await getLessonAssignmentIds(supabase, [lessonId]);
  const hasSubmissions = await hasRowsByIds(supabase, "assignment_submissions", "assignment_id", assignmentIds);
  if (hasSubmissions) {
    throw new Error("This lesson cannot be deleted because students have already submitted answers.");
  }

  const hasProgress = await hasRowsByIds(supabase, "lesson_progress", "lesson_id", [lessonId]);
  if (hasProgress) {
    throw new Error("This lesson cannot be deleted because student progress has already been recorded.");
  }

  const { data: materials, error: materialsError } = await supabase
    .from("lesson_materials")
    .select("file_path")
    .eq("lesson_id", lessonId);
  assertNoError(materialsError, "Could not check the lesson materials");
  const filePaths = ((materials ?? []) as Array<{ file_path?: string | null }>)
    .map((material) => material.file_path)
    .filter((path): path is string => Boolean(path));
  if (filePaths.length) {
    const { error: storageError } = await supabase.storage
      .from("lesson-materials")
      .remove(filePaths);
    assertNoError(storageError, "Could not delete lesson material files");
  }

  const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
  assertNoError(error, "Could not delete the lesson");
}

export async function uploadLessonMaterial(
  supabase: SupabaseClient,
  draft: Pick<LessonMaterial, "lessonId" | "title" | "type" | "downloadable" | "order"> &
    Partial<Pick<LessonMaterial, "externalUrl" | "content">>,
  file?: File,
) {
  const externalUrl = draft.externalUrl?.trim() ?? "";
  const content = draft.content?.trim() ?? "";
  if (draft.type === "video" && !externalUrl) {
    throw new Error("Enter a video URL.");
  }
  if (draft.type === "text" && !content) {
    throw new Error("Enter the material text.");
  }
  if ((draft.type === "pdf" || draft.type === "docx") && !file) {
    throw new Error("Select a material file.");
  }

  const filePath = file ? `${draft.lessonId}/${Date.now()}-${file.name.replaceAll(" ", "-")}` : "";

  if (file) {
    const { error: uploadError } = await supabase.storage
      .from("lesson-materials")
      .upload(filePath, file, { upsert: false });
    assertNoError(uploadError, "Could not upload the material");
  }

  const { error } = await supabase.from("lesson_materials").insert({
    lesson_id: draft.lessonId,
    title: draft.title,
    material_type: draft.type,
    file_path: filePath || null,
    file_size: file?.size ?? 0,
    external_url: draft.type === "video" ? externalUrl : null,
    content: draft.type === "text" ? content : null,
    is_downloadable: draft.downloadable,
    sort_order: draft.order,
  });
  if (error) {
    if (filePath) {
      const { error: rollbackError } = await supabase.storage
        .from("lesson-materials")
        .remove([filePath]);
      assertNoError(rollbackError, "Could not roll back the material upload");
    }
    assertNoError(error, "Could not save the material");
  }
}

export async function updateLessonMaterial(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<
    Pick<LessonMaterial, "title" | "type" | "downloadable" | "order" | "externalUrl" | "content">
  >,
  file?: File,
) {
  const externalUrl = patch.externalUrl?.trim() ?? "";
  const content = patch.content?.trim() ?? "";
  if (patch.type === "video" && !externalUrl) {
    throw new Error("Enter a video URL.");
  }
  if (patch.type === "text" && !content) {
    throw new Error("Enter the material text.");
  }

  const { data: current, error: currentError } = await supabase
    .from("lesson_materials")
    .select("lesson_id, file_path")
    .eq("id", id)
    .single();
  assertNoError(currentError, "Could not find the material");

  const lessonId = asString((current as Row).lesson_id);
  const previousFilePath = asString((current as Row).file_path);
  const clearsStoredFile = patch.type === "video" || patch.type === "text";
  let uploadedFilePath = "";
  let filePatch: Partial<{ file_path: string | null; file_size: number }> = clearsStoredFile
    ? { file_path: null, file_size: 0 }
    : {};
  if (file) {
    const filePath = `${lessonId}/${Date.now()}-${file.name.replaceAll(" ", "-")}`;
    const { error: uploadError } = await supabase.storage
      .from("lesson-materials")
      .upload(filePath, file, { upsert: false });
    assertNoError(uploadError, "Could not upload the material");
    uploadedFilePath = filePath;
    filePatch = { file_path: filePath, file_size: file.size };
  }

  const { error } = await supabase
    .from("lesson_materials")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.type !== undefined ? { material_type: patch.type } : {}),
      ...(patch.downloadable !== undefined ? { is_downloadable: patch.downloadable } : {}),
      ...(patch.order !== undefined ? { sort_order: patch.order } : {}),
      ...(patch.externalUrl !== undefined ? { external_url: externalUrl || null } : {}),
      ...(patch.content !== undefined ? { content: content || null } : {}),
      ...filePatch,
    })
    .eq("id", id);
  if (error) {
    if (uploadedFilePath) {
      const { error: rollbackError } = await supabase.storage
        .from("lesson-materials")
        .remove([uploadedFilePath]);
      assertNoError(rollbackError, "Could not roll back the material upload");
    }
    assertNoError(error, "Could not update the material");
  }

  if (
    previousFilePath &&
    previousFilePath !== uploadedFilePath &&
    (uploadedFilePath || clearsStoredFile)
  ) {
    const { error: cleanupError } = await supabase.storage
      .from("lesson-materials")
      .remove([previousFilePath]);
    assertNoError(cleanupError, "Could not delete the replaced material file");
  }
}

export async function deleteLessonMaterial(supabase: SupabaseClient, material: LessonMaterial) {
  if (material.filePath) {
    const { error: storageError } = await supabase.storage
      .from("lesson-materials")
      .remove([material.filePath]);
    assertNoError(storageError, "Could not delete the material file");
  }

  const { error } = await supabase.from("lesson_materials").delete().eq("id", material.id);
  assertNoError(error, "Could not delete the material");
}

export async function assignTeacherToCourse(
  supabase: SupabaseClient,
  courseId: string,
  teacherId: string,
) {
  const { data: teacher, error: teacherError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", teacherId)
    .single();
  assertNoError(teacherError, "Could not find the teacher");
  if (asString((teacher as Row).role) !== "teacher") {
    throw new Error("Only a user with the teacher role can be assigned to a course.");
  }

  const { error } = await supabase.from("course_staff").upsert(
    { course_id: courseId, profile_id: teacherId, role: "teacher" },
    { onConflict: "course_id,profile_id" },
  );
  assertNoError(error, "Could not assign the teacher");
}

export async function removeTeacherFromCourse(
  supabase: SupabaseClient,
  courseId: string,
  teacherId: string,
) {
  const { error } = await supabase
    .from("course_staff")
    .delete()
    .eq("course_id", courseId)
    .eq("profile_id", teacherId);
  assertNoError(error, "Could not remove the teacher from the course");
}

export async function createAssignment(
  supabase: SupabaseClient,
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
) {
  const { error } = await supabase.from("assignments").insert({
    lesson_id: draft.lessonId,
    title: draft.title,
    description: draft.description,
    due_at: draft.dueAt || null,
    allow_text_answer: draft.allowTextAnswer,
    allow_file_upload: draft.allowFileUpload,
    allow_multiple_files: draft.allowMultipleFiles,
    max_score: draft.maxScore,
  });
  assertNoError(error, "Could not create the assignment");
}

export async function deleteAssignment(supabase: SupabaseClient, assignmentId: string) {
  const hasSubmissions = await hasRowsByIds(supabase, "assignment_submissions", "assignment_id", [
    assignmentId,
  ]);
  if (hasSubmissions) {
    throw new Error("This assignment cannot be deleted because students have already submitted answers.");
  }

  const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
  assertNoError(error, "Could not delete the assignment");
}

export async function submitAssignment(
  supabase: SupabaseClient,
  draft: Pick<AssignmentSubmission, "assignmentId" | "studentId" | "textAnswer">,
  files: File[] = [],
) {
  const textAnswer = draft.textAnswer.trim();
  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("allow_text_answer, allow_file_upload, allow_multiple_files")
    .eq("id", draft.assignmentId)
    .single();
  assertNoError(assignmentError, "Could not check the assignment settings");

  const assignmentRow = assignment as Row;
  const allowTextAnswer = asBoolean(assignmentRow.allow_text_answer, true);
  const allowFileUpload = asBoolean(assignmentRow.allow_file_upload);
  const allowMultipleFiles = asBoolean(assignmentRow.allow_multiple_files);

  if (!allowTextAnswer && textAnswer) {
    throw new Error("This assignment does not accept text answers.");
  }
  if (!allowFileUpload && files.length) {
    throw new Error("This assignment does not accept files.");
  }
  if (!allowMultipleFiles && files.length > 1) {
    throw new Error("Only one file can be attached.");
  }
  if (!textAnswer && files.length === 0) {
    throw new Error("Enter an answer or attach a file.");
  }

  const { data: currentSubmission, error: currentSubmissionError } = await supabase
    .from("assignment_submissions")
    .select("id, file_paths")
    .eq("assignment_id", draft.assignmentId)
    .eq("student_id", draft.studentId)
    .maybeSingle();
  assertNoError(currentSubmissionError, "Could not check the current submission");
  const previousFilePaths = Array.isArray((currentSubmission as Row | null)?.file_paths)
    ? ((currentSubmission as Row).file_paths as unknown[]).map(String).filter(Boolean)
    : [];

  const filePaths: string[] = [];
  for (const file of files) {
    assertAssignmentFile(file);
    const path = `${draft.studentId}/${draft.assignmentId}/${Date.now()}-${sanitizeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("assignment-submissions").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    assertNoError(uploadError, "Could not upload the submission file");
    filePaths.push(path);
  }

  const currentSubmissionId = asOptionalString((currentSubmission as Row | null)?.id);
  const submittedAt = new Date().toISOString();
  const { error } = currentSubmissionId
    ? await supabase
        .from("assignment_submissions")
        .update({
          text_answer: textAnswer,
          file_paths: filePaths,
          submitted_at: submittedAt,
        })
        .eq("id", currentSubmissionId)
    : await supabase.from("assignment_submissions").insert({
        assignment_id: draft.assignmentId,
        student_id: draft.studentId,
        text_answer: textAnswer,
        file_paths: filePaths,
        status: "in_review",
        submitted_at: submittedAt,
      });
  if (error) {
    if (filePaths.length) {
      await supabase.storage.from("assignment-submissions").remove(filePaths);
    }
    assertNoError(error, "Could not submit the assignment");
  }

  if (previousFilePaths.length) {
    await supabase.storage.from("assignment-submissions").remove(previousFilePaths);
  }
}

export async function reviewSubmission(
  supabase: SupabaseClient,
  reviewerId: string,
  id: string,
  patch: Pick<AssignmentSubmission, "status" | "score" | "reviewerComment">,
) {
  const { error: submissionError } = await supabase
    .from("assignment_submissions")
    .update({ status: patch.status, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  assertNoError(submissionError, "Could not update the submission status");

  if (patch.score !== undefined) {
    const { error: gradeError } = await supabase.from("grades").upsert(
      {
        submission_id: id,
        reviewer_id: reviewerId,
        score: patch.score,
      },
      { onConflict: "submission_id" },
    );
    assertNoError(gradeError, "Could not save the score");
  }

  if (patch.reviewerComment?.trim()) {
    const { error: commentError } = await supabase.from("comments").insert({
      submission_id: id,
      author_id: reviewerId,
      body: patch.reviewerComment.trim(),
    });
    assertNoError(commentError, "Could not save the comment");
  }
}

export async function updateProfile(supabase: SupabaseClient, id: string, patch: Partial<Profile>) {
  const { error } = await supabase
    .from("profiles")
    .update({
      ...(patch.fullName !== undefined ? { full_name: patch.fullName } : {}),
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.telegram !== undefined ? { telegram: patch.telegram } : {}),
      ...(patch.schoolId !== undefined ? { school_id: patch.schoolId || null } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
    })
    .eq("id", id);
  assertNoError(error, "Could not update the profile");
}

export async function setCurrentStudentLessonProgress(
  supabase: SupabaseClient,
  lessonId: string,
  completed: boolean,
) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("unauthorized");
  }

  const { error } = await supabase.from("lesson_progress").upsert(
    {
      lesson_id: lessonId,
      student_id: userData.user.id,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: "lesson_id,student_id" },
  );
  if (error) {
    throw new Error("progressUpdateFailed");
  }
}

export async function createStream(supabase: SupabaseClient, title: string) {
  const { error } = await supabase.from("streams").insert({ title });
  assertNoError(error, "Could not create the cohort");
}

export async function createGroup(
  supabase: SupabaseClient,
  draft: { title: string; streamId?: string; curatorId?: string },
) {
  const { error } = await supabase.from("groups").insert({
    title: draft.title,
    stream_id: draft.streamId || null,
    curator_id: draft.curatorId || null,
  });
  assertNoError(error, "Could not create the group");
}

export async function addStudentToGroup(supabase: SupabaseClient, groupId: string, studentId: string) {
  const { error } = await supabase
    .from("group_members")
    .upsert({ group_id: groupId, student_id: studentId }, { onConflict: "group_id,student_id" });
  assertNoError(error, "Could not add the student to the group");
}

export async function enrollStudentToCourse(
  supabase: SupabaseClient,
  courseId: string,
  studentId: string,
) {
  const { error } = await supabase.from("course_enrollments").insert({
    course_id: courseId,
    student_id: studentId,
  });
  assertNoError(error, "Could not assign the course to the student");
}

export async function enrollStudentToCourseByIdentifier(
  supabase: SupabaseClient,
  courseId: string,
  email: string,
  fullName: string,
  schoolId?: string,
) {
  const { error } = await supabase.rpc("teacher_enroll_student_to_course", {
    p_course_id: courseId,
    p_email: email,
    p_full_name: fullName,
    p_school_id: schoolId || null,
  });
  assertNoError(error, "Could not enroll the student in the course");
}

export async function removeStudentFromCourse(
  supabase: SupabaseClient,
  courseId: string,
  studentId: string,
) {
  const { error } = await supabase
    .from("course_enrollments")
    .delete()
    .eq("course_id", courseId)
    .eq("student_id", studentId);
  assertNoError(error, "Could not remove the student from the course");
}

export async function enrollGroupToCourse(supabase: SupabaseClient, courseId: string, groupId: string) {
  const { error } = await supabase
    .from("course_groups")
    .upsert({ course_id: courseId, group_id: groupId }, { onConflict: "course_id,group_id" });
  assertNoError(error, "Could not assign the course to the group");
}

export async function toggleLessonAccess(
  supabase: SupabaseClient,
  lessonId: string,
  targetType: LessonAccess["targetType"],
  targetId: string,
  isOpen: boolean,
) {
  const { error } = await supabase.from("lesson_access").upsert(
    {
      lesson_id: lessonId,
      target_type: targetType,
      target_id: targetId,
      is_open: isOpen,
    },
    { onConflict: "lesson_id,target_type,target_id" },
  );
  assertNoError(error, "Could not update lesson access");
}
