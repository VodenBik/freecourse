"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { BookOpen, Download, FileText, Lock, PlayCircle, Send } from "lucide-react";
import { useAuth, useLocale, useSchoolData } from "@/components/providers";
import {
  assignmentSubmissionAllowedExtensions,
  assignmentSubmissionMaxFileSize,
  studentDisplayName,
} from "@/lib/school-api";
import { submissionLabel, submissionTone } from "@/lib/status";
import type {
  Assignment,
  AssignmentSubmissionFile,
  Course,
  Lesson,
  Locale,
  SchoolData,
} from "@/types/domain";

const assignmentFileAccept = assignmentSubmissionAllowedExtensions
  .map((extension) => `.${extension}`)
  .join(",");

function isLessonOpen(lesson: Lesson, studentId: string, groupIds: string[], data: SchoolData) {
  if (lesson.isOpenByDefault) return true;
  return data.lessonAccess.some(
    (access) =>
      access.lessonId === lesson.id &&
      access.isOpen &&
      ((access.targetType === "student" && access.targetId === studentId) ||
        (access.targetType === "group" && groupIds.includes(access.targetId))),
  );
}

export function StudentDashboard() {
  const { profile } = useAuth();
  const { data, dataLoading, submitAssignment } = useSchoolData();
  const { locale, translate } = useLocale();
  const [activeCourseId, setActiveCourseId] = useState(profile?.assignedCourseIds[0] ?? data.courses[0]?.id);
  const [answerByAssignment, setAnswerByAssignment] = useState<Record<string, string>>({});
  const [errorByAssignment, setErrorByAssignment] = useState<Record<string, string>>({});
  const [submittingAssignmentId, setSubmittingAssignmentId] = useState<string | null>(null);

  const student = profile;

  const courses = useMemo(() => {
    if (!student) return [];
    if (student.role === "student") {
      return data.courses.filter(
        (course) =>
          course.active &&
          (student.assignedCourseIds.includes(course.id) ||
            course.groupIds.some((groupId) => student.groupIds.includes(groupId))),
      );
    }
    return data.courses;
  }, [data.courses, student]);

  const activeCourse = courses.find((course) => course.id === activeCourseId) ?? courses[0];
  const notifications = data.notifications.filter((item) => item.profileId === student?.id);

  async function handleSubmitAssignment(
    event: FormEvent<HTMLFormElement>,
    assignment: Assignment,
  ) {
    event.preventDefault();
    if (!student) return;
    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll("files")
      .filter((file): file is File => file instanceof File && file.size > 0);
    const textAnswer = answerByAssignment[assignment.id]?.trim() ?? "";

    setErrorByAssignment((current) => ({ ...current, [assignment.id]: "" }));

    if (!textAnswer && files.length === 0) {
      setErrorByAssignment((current) => ({
        ...current,
        [assignment.id]: translate("emptySubmissionError"),
      }));
      return;
    }

    if (assignment.allowFileUpload) {
      if (!assignment.allowMultipleFiles && files.length > 1) {
        setErrorByAssignment((current) => ({
          ...current,
          [assignment.id]: translate("singleFileOnlyError"),
        }));
        return;
      }

      const oversizedFile = files.find((file) => file.size > assignmentSubmissionMaxFileSize);
      if (oversizedFile) {
        setErrorByAssignment((current) => ({
          ...current,
          [assignment.id]: translate("fileTooLargeError"),
        }));
        return;
      }

      const unsupportedFile = files.find((file) => {
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        return !assignmentSubmissionAllowedExtensions.includes(extension);
      });
      if (unsupportedFile) {
        setErrorByAssignment((current) => ({
          ...current,
          [assignment.id]: translate("fileTypeError"),
        }));
        return;
      }
    }

    setSubmittingAssignmentId(assignment.id);
    try {
      await submitAssignment({
        assignmentId: assignment.id,
        studentId: student.id,
        textAnswer,
      }, files);
      setAnswerByAssignment((current) => ({ ...current, [assignment.id]: "" }));
      event.currentTarget.reset();
    } catch (error) {
      setErrorByAssignment((current) => ({
        ...current,
        [assignment.id]: error instanceof Error ? error.message : translate("submissionUploadError"),
      }));
    } finally {
      setSubmittingAssignmentId(null);
    }
  }

  if (!student) {
    return null;
  }

  return (
    <main className="page-shell">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{translate("studentCabinet")}</p>
          <h1 style={{ fontSize: 44 }}>{translate("dashboard")}</h1>
          <p>
            {studentDisplayName(student, locale)}
            {student.schoolId ? ` · ${translate("schoolId")} ${student.schoolId}` : ""}
          </p>
        </div>
        <span className="badge">
          {student.role === "student" ? translate("student") : translate("employee")}
        </span>
      </div>

      <section className="dashboard-grid">
        <div className="grid">
          {dataLoading ? <div className="empty-state">{translate("loading")}</div> : null}
          <CoursePicker
            activeCourse={activeCourse}
            courses={courses}
            onSelect={setActiveCourseId}
            translate={translate}
          />

          {activeCourse ? (
            <CourseContent
              course={activeCourse}
              studentId={student.id}
              groupIds={student.groupIds}
              answerByAssignment={answerByAssignment}
              errorByAssignment={errorByAssignment}
              submittingAssignmentId={submittingAssignmentId}
              setAnswerByAssignment={setAnswerByAssignment}
            onSubmitAssignment={handleSubmitAssignment}
            locale={locale}
            translate={translate}
          />
          ) : (
            <div className="empty-state">{translate("noCourses")}</div>
          )}
        </div>

        <aside className="grid">
          <StatsPanel studentId={student.id} translate={translate} />
          <section className="card">
            <h2>{translate("notifications")}</h2>
            <div className="grid">
              {notifications.length ? (
                notifications.map((item) => (
                  <div className="card compact" key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </div>
                ))
              ) : (
                <div className="empty-state">{translate("noNotifications")}</div>
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function CoursePicker({
  activeCourse,
  courses,
  onSelect,
  translate,
}: {
  activeCourse?: Course;
  courses: Course[];
  onSelect: (id: string) => void;
  translate: (key: string) => string;
}) {
  return (
    <section className="card">
      <div className="panel-title">
        <h2>{translate("availableCourses")}</h2>
        <span className="badge">{courses.length}</span>
      </div>
      <div className="grid">
        {courses.map((course) => (
          <button
            className={course.id === activeCourse?.id ? "lesson-strip" : "lesson-strip"}
            key={course.id}
            onClick={() => onSelect(course.id)}
            type="button"
          >
            <span>
              <BookOpen size={18} /> {course.title}
            </span>
            <span className={course.active ? "status ok" : "status gray"}>
              {course.active ? translate("active") : translate("closed")}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function SubmissionFiles({
  files,
  translate,
}: {
  files: AssignmentSubmissionFile[];
  translate: (key: string) => string;
}) {
  return (
    <div className="file-list">
      <strong>{translate("attachedFiles")}</strong>
      {files.map((file) =>
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
  );
}

function CourseContent({
  course,
  studentId,
  groupIds,
  answerByAssignment,
  errorByAssignment,
  submittingAssignmentId,
  setAnswerByAssignment,
  onSubmitAssignment,
  locale,
  translate,
}: {
  course: Course;
  studentId: string;
  groupIds: string[];
  answerByAssignment: Record<string, string>;
  errorByAssignment: Record<string, string>;
  submittingAssignmentId: string | null;
  setAnswerByAssignment: Dispatch<SetStateAction<Record<string, string>>>;
  onSubmitAssignment: (event: FormEvent<HTMLFormElement>, assignment: Assignment) => Promise<void>;
  locale: Locale;
  translate: (key: string) => string;
}) {
  const { data } = useSchoolData();
  const modules = data.modules
    .filter((item) => item.courseId === course.id)
    .sort((a, b) => a.order - b.order);

  const completed = data.lessonProgress.filter(
    (item) => item.studentId === studentId && item.completed,
  ).length;
  const allLessons = modules.flatMap((module) =>
    data.lessons.filter((lesson) => lesson.moduleId === module.id),
  );
  const progress = allLessons.length ? Math.round((completed / allLessons.length) * 100) : 0;

  return (
    <section className="card">
      <div className="panel-title">
        <div>
          <h2>{course.title}</h2>
          <p>{course.description}</p>
        </div>
        <span className="badge">{progress}%</span>
      </div>
      <div className="progress-bar" aria-label={`${translate("progress")} ${progress}%`}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="grid" style={{ marginTop: 18 }}>
        {modules.map((module) => {
          const lessons = data.lessons
            .filter((lesson) => lesson.moduleId === module.id)
            .sort((a, b) => a.order - b.order);
          return (
            <section className="card compact" key={module.id}>
              <h3>{module.title}</h3>
              <p>{module.description}</p>
              <div className="grid">
                {lessons.map((lesson) => {
                  const open = isLessonOpen(lesson, studentId, groupIds, data);
                  const materials = data.materials
                    .filter((item) => item.lessonId === lesson.id)
                    .sort((a, b) => a.order - b.order);
                  const assignment = data.assignments.find((item) => item.lessonId === lesson.id);
                  const submission = assignment
                    ? data.submissions.find(
                        (item) => item.assignmentId === assignment.id && item.studentId === studentId,
                      )
                    : undefined;

                  return (
                    <article className={`lesson-card card compact ${open ? "" : "locked"}`} key={lesson.id}>
                      <div className="panel-title">
                        <div>
                          <h3>{lesson.title}</h3>
                          <p>{lesson.description}</p>
                        </div>
                        {open ? (
                          <span className="status ok">{translate("open")}</span>
                        ) : (
                          <span className="status gray">
                            <Lock size={14} /> {translate("lessonLocked")}
                          </span>
                        )}
                      </div>

                      {open ? (
                        <>
                          <p>{lesson.content}</p>
                          <div className="grid">
                            {materials.map((material) => (
                              <div className="lesson-strip" key={material.id}>
                                <span>
                                  {material.type === "video" ? <PlayCircle size={18} /> : <FileText size={18} />}
                                  {material.title}
                                  {material.fileSize ? ` · ${material.fileSize}` : ""}
                                </span>
                                {material.type === "video" && material.externalUrl ? (
                                  <a className="status ok" href={material.externalUrl} rel="noreferrer" target="_blank">
                                    {translate("openVideo")}
                                  </a>
                                ) : material.type === "text" && material.content ? (
                                  <span className="muted">{material.content}</span>
                                ) : (material.type === "pdf" || material.type === "docx") && material.url ? (
                                  material.downloadable ? (
                                    <a className="status ok" href={material.url} rel="noreferrer" target="_blank">
                                      <Download size={14} /> {translate("download")}
                                    </a>
                                  ) : (
                                    <a className="status ok" href={material.url} rel="noreferrer" target="_blank">
                                      {translate("openFile")}
                                    </a>
                                  )
                                ) : material.downloadable ? (
                                  <span className="status gray">{translate("fileUnavailable")}</span>
                                ) : (
                                  <span className="status gray">{translate("viewOnly")}</span>
                                )}
                              </div>
                            ))}
                          </div>

                          {assignment ? (
                            <div className="card compact">
                              <div className="panel-title">
                                <div>
                                  <h3>{translate("homework")}</h3>
                                  <p>{assignment.description}</p>
                                </div>
                                <span className={`status ${submissionTone(submission?.status ?? "not_submitted")}`}>
                                  {submissionLabel(submission?.status ?? "not_submitted", locale)}
                                </span>
                              </div>

                              {submission?.score !== undefined ? (
                                <p>
                                  <strong>{translate("score")}:</strong> {submission.score}/100
                                </p>
                              ) : null}
                              {submission?.reviewerComment ? (
                                <p>
                                  <strong>{translate("comment")}:</strong> {submission.reviewerComment}
                                </p>
                              ) : null}
                              {submission?.files.length ? (
                                <SubmissionFiles files={submission.files} translate={translate} />
                              ) : null}

                              <form
                                className="form-grid"
                                onSubmit={(event) => onSubmitAssignment(event, assignment)}
                              >
                                {assignment.allowTextAnswer ? (
                                  <label>
                                    {translate("answer")}
                                    <textarea
                                      value={answerByAssignment[assignment.id] ?? ""}
                                      onChange={(event) =>
                                        setAnswerByAssignment((current) => ({
                                          ...current,
                                          [assignment.id]: event.target.value,
                                        }))
                                      }
                                      placeholder={translate("answerPlaceholder")}
                                    />
                                  </label>
                                ) : null}
                                {assignment.allowFileUpload ? (
                                  <label>
                                    {translate("files")}
                                    <input
                                      accept={assignmentFileAccept}
                                      multiple={assignment.allowMultipleFiles}
                                      name="files"
                                      type="file"
                                    />
                                    <span className="helper">{translate("assignmentFileHelp")}</span>
                                  </label>
                                ) : null}
                                {errorByAssignment[assignment.id] ? (
                                  <div className="error">{errorByAssignment[assignment.id]}</div>
                                ) : null}
                                <button
                                  className="button"
                                  disabled={submittingAssignmentId === assignment.id}
                                  type="submit"
                                >
                                  <Send size={16} />
                                  {submittingAssignmentId === assignment.id
                                    ? translate("pleaseWait")
                                    : translate("submitWork")}
                                </button>
                              </form>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function StatsPanel({
  studentId,
  translate,
}: {
  studentId: string;
  translate: (key: string) => string;
}) {
  const { data } = useSchoolData();
  const submissions = data.submissions.filter((item) => item.studentId === studentId);
  const reviewed = submissions.filter((item) => item.score !== undefined);
  const average = reviewed.length
    ? Math.round(reviewed.reduce((sum, item) => sum + (item.score ?? 0), 0) / reviewed.length)
    : 0;

  return (
    <section className="card">
      <h2>{translate("summary")}</h2>
      <div className="stat-row">
        <div>
          <span className="stat-value">{submissions.length}</span>
          <span className="muted">{translate("works")}</span>
        </div>
        <div>
          <span className="stat-value">{average}</span>
          <span className="muted">{translate("averageScore")}</span>
        </div>
      </div>
    </section>
  );
}
