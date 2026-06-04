import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  courseQueryKeys,
  setCourseBundleQueryData,
  setCourseLessonsForCourseQueryData,
} from "./courseQueries";
import type { CourseBundle } from "./courseBundle";

describe("course query cache helpers", () => {
  it("updates one course lesson map entry without losing sibling courses", () => {
    const queryClient = new QueryClient();
    const bundle = {
      courses: [
        { id: "course-1", title: "Course 1" },
        { id: "course-2", title: "Course 2" },
      ],
      lessons: {
        "course-1": [{ id: "lesson-old", title: "Old lesson" }],
        "course-2": [{ id: "lesson-2", title: "Second course lesson" }],
      },
    } as unknown as CourseBundle;

    setCourseBundleQueryData(queryClient, bundle);
    setCourseLessonsForCourseQueryData(
      queryClient,
      "course-1",
      [{ id: "lesson-new", title: "New lesson" }] as CourseBundle["lessons"][string],
    );

    const cached = queryClient.getQueryData<CourseBundle>(courseQueryKeys.bundle());

    expect(cached?.courses).toEqual(bundle.courses);
    expect(cached?.lessons["course-1"]).toEqual([{ id: "lesson-new", title: "New lesson" }]);
    expect(cached?.lessons["course-2"]).toEqual([{ id: "lesson-2", title: "Second course lesson" }]);
  });
});
