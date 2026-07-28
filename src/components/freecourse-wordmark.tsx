type FreeCourseWordmarkProps = {
  ariaLabel?: string;
  className?: string;
};

export function FreeCourseWordmark({
  ariaLabel = "FreeCourse",
  className = "",
}: FreeCourseWordmarkProps) {
  return (
    <span
      aria-label={ariaLabel}
      className={`freecourse-wordmark ${className}`.trim()}
      role="text"
    >
      <span className="freecourse-wordmark-free">Free</span>{" "}
      <span className="freecourse-wordmark-course">course</span>
    </span>
  );
}
