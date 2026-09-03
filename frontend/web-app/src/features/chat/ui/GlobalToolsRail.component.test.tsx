// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MeProfile } from "../../../shared/api/playsay";
import { GlobalToolsRail } from "./GlobalToolsRail";

const mocks = vi.hoisted(() => ({
  contacts: vi.fn(), conversations: vi.fn(),
  t: (key: string) => key,
  push: { status: "disabled", enable: vi.fn(), disable: vi.fn(), refresh: vi.fn() },
}));
vi.mock("../../../shared/i18n", () => ({ useAppTranslation: () => ({ t: mocks.t, i18n: { language: "en" } }) }));
vi.mock("../model/useChatPushSubscription", () => ({ useChatPushSubscription: () => mocks.push }));
vi.mock("../api/chatApi", () => ({
  fetchChatContacts: mocks.contacts, fetchChatConversations: mocks.conversations,
  openChatSocket: async () => null,
}));
const profile = { subject: "teacher", roles: ["ADMIN", "TEACHER"] } as MeProfile;
const contact = { id: "student", subject: "student", displayName: "Anna Smith", username: "ann-login", role: "STUDENT" as const };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.contacts.mockResolvedValue([contact]);
  mocks.conversations.mockResolvedValue([]);
  mocks.push.status = "disabled";
});
afterEach(cleanup);

it("shows chat then dotted dice, opens without rolling and restores keyboard focus", async () => {
  const roll = vi.fn();
  const { container } = render(<GlobalToolsRail profile={profile} classroomDice={{ lastRoll: null, liveRoll: null, rejection: null, roll }} />);
  await waitFor(() => expect(mocks.contacts).toHaveBeenCalled());
  expect([...container.querySelectorAll("[data-tool]")].map((item) => item.getAttribute("data-tool"))).toEqual(["chat", "dice"]);
  const dice = screen.getByRole("button", { name: "dice.roll" });
  expect(dice.querySelector(".lucide-dices")).not.toBeNull();
  fireEvent.click(dice);
  const panel = screen.getByRole("dialog", { name: "dice.title" });
  expect(roll).not.toHaveBeenCalled();
  fireEvent.click(within(panel).getByRole("button", { name: "dice.roll" }));
  expect(roll).toHaveBeenCalledOnce();
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(dice));
});

it("retains contacts after conversation failure and retries only the failed collection", async () => {
  mocks.conversations.mockRejectedValue(new Error("offline"));
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  await screen.findByText("chat.errors.conversations");
  expect(screen.getByText("Anna Smith")).toBeDefined();
  mocks.conversations.mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "chat.retry" }));
  await waitFor(() => expect(screen.queryByText("chat.errors.conversations")).toBeNull());
  expect(mocks.contacts).toHaveBeenCalledOnce();
});

it("explains unavailable notifications and provides recovery", async () => {
  mocks.push.status = "unavailable";
  render(<GlobalToolsRail profile={profile} />);
  fireEvent.click(screen.getByRole("button", { name: "chat.open" }));
  await waitFor(() => expect(mocks.contacts).toHaveBeenCalled());
  fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "chat.retry" }));
  expect(mocks.push.refresh).toHaveBeenCalledOnce();
  expect(mocks.push.enable).not.toHaveBeenCalled();
});
