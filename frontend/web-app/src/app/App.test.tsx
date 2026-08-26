// @vitest-environment jsdom
// @vitest-environment-options { "url": "http://localhost/forgot-password?email=student%40example.com" }

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/registration", () => ({
  RegistrationPage: ({ route }: { route: { kind: string } }) => <div>{route.kind}:{window.location.search}</div>,
  StudentInvitePage: () => <div>student-invite</div>,
}));
vi.mock("../features/payments", () => ({
  PublicPaymentPage: () => <div>payment</div>,
}));
vi.mock("../features/lesson-access", () => ({
  LessonAccessPage: ({ lessonId }: { lessonId: string }) => <div>lesson-access:{lessonId}</div>,
  LessonAssertionPage: ({ lessonId }: { lessonId: string }) => <div>lesson-assertion:{lessonId}</div>,
}));
vi.mock("./AppShell", () => ({ AppShell: () => <div>authenticated</div> }));
vi.mock("./useAppController", () => ({ useAppController: () => ({}) }));

afterEach(() => cleanup());

describe("public SPA routing", () => {
  it("rerenders the password reset page after history navigation and keeps query parameters", () => {
    render(<App />);
    expect(screen.getByText("forgot-password:?email=student%40example.com")).toBeTruthy();

    act(() => {
      window.history.pushState({}, "", "/reset-password?email=student%40example.com");
    });

    expect(screen.getByText("reset-password:?email=student%40example.com")).toBeTruthy();

    act(() => {
      window.history.replaceState({}, "", "/forgot-password?email=other%40example.com");
    });

    expect(screen.getByText("forgot-password:?email=other%40example.com")).toBeTruthy();
  });
});
