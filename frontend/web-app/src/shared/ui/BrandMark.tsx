import { useAppTranslation } from "../i18n";

export function BrandMark({ variant = "header" }: { variant?: "header" | "welcome" }) {
  const { t } = useAppTranslation();

  return (
    <span className={`honey-brand honey-brand--${variant}`} role="img" aria-label={t("common.appName")}>
      <img
        aria-hidden="true"
        className="honey-brand__logo honey-brand__logo--light"
        height="215"
        src="/brand/logo/honey-school-logo.svg"
        width="1080"
      />
      <img
        aria-hidden="true"
        className="honey-brand__logo honey-brand__logo--dark"
        height="215"
        src="/brand/logo/honey-school-logo-reverse.svg"
        width="1080"
      />
      <img
        aria-hidden="true"
        className="honey-brand__mark"
        height="512"
        src="/brand/logo/honey-school-mark.svg"
        width="512"
      />
    </span>
  );
}
