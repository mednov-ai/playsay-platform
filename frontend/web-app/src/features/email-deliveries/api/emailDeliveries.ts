import {
  getEmailDelivery as getEmailDeliveryRequest,
  listEmailDeliveries as listEmailDeliveriesRequest,
  resendEmailDelivery as resendEmailDeliveryRequest,
  type EmailDeliveryDetailResponse,
  type EmailDeliveryPageResponse,
  type EmailDeliveryResendResponse,
  type EmailDeliverySummaryResponse,
  type ListEmailDeliveriesParams,
} from "../../../generated/playsay-api";
import { authConfig, clearTokens } from "../../../shared/api/auth";
import { apiErrorFromData } from "../../../shared/api/errors";
import { authorizedOptions } from "../../../shared/api/http";

export type EmailDeliverySummary = EmailDeliverySummaryResponse;
export type EmailDeliveryDetail = EmailDeliveryDetailResponse;
export type EmailDeliveryPage = EmailDeliveryPageResponse;

export type EmailDeliveryFilters = {
  page: number;
  search: string;
  status: string;
  providerStatus: string;
  templateKey: string;
  createdFrom: string;
  createdTo: string;
};

export const emailDeliveryKeys = {
  all: ["email-deliveries"] as const,
  detail: (id: string) => [...emailDeliveryKeys.all, "detail", id] as const,
  list: (filters: EmailDeliveryFilters) => [...emailDeliveryKeys.all, "list", filters] as const,
};

export async function fetchEmailDeliveries(filters: EmailDeliveryFilters): Promise<EmailDeliveryPage> {
  const params: ListEmailDeliveriesParams = {
    page: filters.page,
    size: 25,
    search: filters.search || undefined,
    status: filters.status || undefined,
    providerStatus: filters.providerStatus || undefined,
    templateKey: filters.templateKey || undefined,
    createdFrom: filters.createdFrom ? new Date(filters.createdFrom).toISOString() : undefined,
    createdTo: filters.createdTo ? new Date(filters.createdTo).toISOString() : undefined,
  };
  const response = await listEmailDeliveriesRequest(params, await authorizedOptions(authConfig));
  return successfulData(response.status, response.data, "Email delivery list request failed");
}

export async function fetchEmailDelivery(id: string): Promise<EmailDeliveryDetail> {
  const response = await getEmailDeliveryRequest(id, await authorizedOptions(authConfig));
  return successfulData(response.status, response.data, "Email delivery detail request failed");
}

export async function resendEmailDelivery(id: string): Promise<EmailDeliveryResendResponse> {
  const response = await resendEmailDeliveryRequest(id, await authorizedOptions(authConfig));
  return successfulData(response.status, response.data, "Email delivery resend request failed");
}

function successfulData<T>(status: number, data: T, fallback: string): T {
  if (status === 401) clearTokens();
  if (status !== 200) throw apiErrorFromData(status, data as unknown, `${fallback} with HTTP ${status}.`);
  return data;
}
