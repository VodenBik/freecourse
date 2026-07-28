export type Locale = "ru" | "en";

export type UserRole = "admin" | "curator" | "teacher" | "student";

export type CourseLanguage = "ru" | "en";

export type AccessMode =
  | "all_open"
  | "gradual"
  | "after_submission"
  | "after_review"
  | "manual"
  | "time_limited";

export type MaterialType = "video" | "pdf" | "docx" | "text";

export type SubmissionStatus =
  | "not_submitted"
  | "submitted"
  | "in_review"
  | "accepted"
  | "needs_revision"
  | "overdue";

export type Profile = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  telegram?: string;
  schoolId?: string;
  role: UserRole;
  groupIds: string[];
  assignedCourseIds: string[];
};

export type Stream = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
};

export type StudyGroup = {
  id: string;
  title: string;
  streamId: string;
  curatorId: string;
  studentIds: string[];
  courseIds: string[];
};

export type Course = {
  id: string;
  title: string;
  description: string;
  language: CourseLanguage;
  active: boolean;
  accessMode: AccessMode;
  accessStartsAt?: string;
  accessEndsAt?: string;
  groupIds: string[];
  streamIds: string[];
  teacherIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CourseModule = {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
};

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  description: string;
  content: string;
  order: number;
  isOpenByDefault: boolean;
  hasAssignment: boolean;
};

export type LessonMaterial = {
  id: string;
  lessonId: string;
  title: string;
  type: MaterialType;
  filePath: string;
  fileSize: string;
  url?: string;
  externalUrl?: string;
  content?: string;
  downloadable: boolean;
  order: number;
};

export type Assignment = {
  id: string;
  lessonId: string;
  title: string;
  description: string;
  dueAt?: string;
  allowTextAnswer: boolean;
  allowFileUpload: boolean;
  allowMultipleFiles: boolean;
  maxScore: number;
};

export type AssignmentSubmission = {
  id: string;
  assignmentId: string;
  studentId: string;
  textAnswer: string;
  fileNames: string[];
  files: AssignmentSubmissionFile[];
  status: SubmissionStatus;
  score?: number;
  reviewerComment?: string;
  submittedAt?: string;
  reviewedAt?: string;
};

export type AssignmentSubmissionFile = {
  name: string;
  path: string;
  url?: string;
};

export type LessonAccess = {
  id: string;
  lessonId: string;
  targetType: "student" | "group" | "stream";
  targetId: string;
  isOpen: boolean;
  startsAt?: string;
  endsAt?: string;
};

export type LessonProgress = {
  id: string;
  lessonId: string;
  studentId: string;
  completed: boolean;
  completedAt?: string;
};

export type Notification = {
  id: string;
  profileId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type SchoolSettings = {
  name: string;
  description: string;
  email?: string;
  phone?: string;
  telegram?: string;
};

export type SchoolData = {
  profiles: Profile[];
  streams: Stream[];
  groups: StudyGroup[];
  courses: Course[];
  modules: CourseModule[];
  lessons: Lesson[];
  materials: LessonMaterial[];
  assignments: Assignment[];
  submissions: AssignmentSubmission[];
  lessonAccess: LessonAccess[];
  lessonProgress: LessonProgress[];
  notifications: Notification[];
};
