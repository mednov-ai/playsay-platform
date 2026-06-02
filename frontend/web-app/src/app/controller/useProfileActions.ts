import type { Dispatch, SetStateAction } from "react";
import {
  fetchAdminUserProfiles,
  fetchUserProfile,
  resetUserProfile,
  saveUserProfile,
  type AdminUserProfile,
  type AppUserProfile,
  type UpdateUserProfileInput,
} from "../../shared/api/playsay";
import { changeAppLanguage, useAppTranslation } from "../../shared/i18n";
import type { SessionErrorHandler } from "./types";

export function useProfileActions({
  applySessionError,
  isAdmin,
  setAdminLoading,
  setAdminMessage,
  setAdminUsers,
  setAppProfile,
  setProfileMessage,
  setProfileSaving,
}: {
  applySessionError: SessionErrorHandler;
  isAdmin: boolean;
  setAdminLoading: Dispatch<SetStateAction<boolean>>;
  setAdminMessage: Dispatch<SetStateAction<string | null>>;
  setAdminUsers: Dispatch<SetStateAction<AdminUserProfile[]>>;
  setAppProfile: Dispatch<SetStateAction<AppUserProfile | null>>;
  setProfileMessage: Dispatch<SetStateAction<string | null>>;
  setProfileSaving: Dispatch<SetStateAction<boolean>>;
}) {
  const { i18n, t } = useAppTranslation();

  async function saveProfile(input: UpdateUserProfileInput) {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const updated = await saveUserProfile(input);
      setAppProfile(updated);
      setAdminUsers((current) =>
        current.map((user) => (user.subject === updated.subject ? updated : user)),
      );
      if (updated.locale) {
        void changeAppLanguage(updated.locale);
      }
      setProfileMessage(i18n.t("profile.messages.saved", { lng: updated.locale || i18n.resolvedLanguage || i18n.language }));
    } catch (caught) {
      setProfileMessage(applySessionError(caught, t("profile.messages.saveFailed")));
    } finally {
      setProfileSaving(false);
    }
  }

  async function resetProfile() {
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      await resetUserProfile();
      const recreated = await fetchUserProfile();
      setAppProfile(recreated);
      setAdminUsers((current) =>
        current.map((user) => (user.subject === recreated.subject ? recreated : user)),
      );
      if (recreated.locale) {
        void changeAppLanguage(recreated.locale);
      }
      setProfileMessage(i18n.t("profile.messages.reset", { lng: recreated.locale || i18n.resolvedLanguage || i18n.language }));
    } catch (caught) {
      setProfileMessage(applySessionError(caught, t("profile.messages.resetFailed")));
    } finally {
      setProfileSaving(false);
    }
  }

  async function refreshAdminUsers() {
    if (!isAdmin) {
      return;
    }

    setAdminLoading(true);
    setAdminMessage(null);
    try {
      setAdminUsers(await fetchAdminUserProfiles());
    } catch (caught) {
      setAdminMessage(applySessionError(caught, t("profile.messages.adminUsersLoadFailed")));
    } finally {
      setAdminLoading(false);
    }
  }

  return {
    refreshAdminUsers,
    resetProfile,
    saveProfile,
  };
}
