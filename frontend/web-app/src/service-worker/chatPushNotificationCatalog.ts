import { deChatPushNotification } from "../shared/i18n/resources/de";
import { enChatPushNotification } from "../shared/i18n/resources/en";
import { frChatPushNotification } from "../shared/i18n/resources/fr";
import { ruChatPushNotification } from "../shared/i18n/resources/ru";

export const chatPushNotificationCatalog = {
  de: deChatPushNotification,
  en: enChatPushNotification,
  fr: frChatPushNotification,
  ru: ruChatPushNotification,
} as const;

export type ChatPushLocale = keyof typeof chatPushNotificationCatalog;
