import type { UseQueryResult } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../../../components/ui/button";
import { isApiStatus } from "../../../shared/api/errors";
import { useAppTranslation } from "../../../shared/i18n";

export function VocabularyQueryState({ query, children }: { query: UseQueryResult<unknown>; children: ReactNode }) {
  const { t } = useAppTranslation();
  if (query.isPending) return <div role="status" aria-label={t("common.status.loading")}><Loader2 className="mx-auto mt-8 h-6 w-6 animate-spin text-primary" /></div>;
  const denied = isApiStatus(query.error, 403) || isApiStatus(query.error, 401);
  return <>
    {query.isError ? <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-3" role="alert">
      <p className="text-sm font-semibold text-destructive">{t(denied ? "vocabulary.messages.accessDenied" : "vocabulary.messages.loadFailed")}</p>
      <Button className="mt-2" disabled={query.isFetching} onClick={() => void query.refetch()} type="button" variant="outline">{t("vocabulary.actions.retry")}</Button>
    </div> : null}
    {query.data !== undefined && !denied ? children : null}
  </>;
}
