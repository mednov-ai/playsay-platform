import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../../app/AppProviders";
import { AdminUsersPanel } from "./AdminUsersPanel";
import { TeacherStudentsPanel } from "./TeacherStudentsPanel";

describe("user management panels", () => {
  it("renders the teacher student sections and delegation entry point", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <TeacherStudentsPanel />
      </AppProviders>,
    );

    expect(markup).toContain("Мои ученики");
    expect(markup).toContain("Мне делегированы");
    expect(markup).toContain("Созданные делегирования");
    expect(markup).toContain("Новое делегирование");
  });

  it("renders admin search, user creation and delegations", () => {
    const markup = renderToStaticMarkup(
      <AppProviders>
        <AdminUsersPanel />
      </AppProviders>,
    );

    expect(markup).toContain("Пользователи");
    expect(markup).toContain("Создать пользователя");
    expect(markup).toContain("Все делегирования");
  });
});
