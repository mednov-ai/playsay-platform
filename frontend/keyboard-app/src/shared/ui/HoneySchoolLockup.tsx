export function HoneySchoolLockup({ ariaLabel, product }: { ariaLabel: string; product: string }) {
  return (
    <span className="honey-school-lockup" role="img" aria-label={ariaLabel}>
      <span className="honey-school-lockup__images" aria-hidden="true">
        <img
          className="honey-school-lockup__logo honey-school-lockup__logo--light"
          height="215"
          src="/brand/logo/honey-school-logo.svg"
          width="1080"
        />
        <img
          className="honey-school-lockup__logo honey-school-lockup__logo--dark"
          height="215"
          src="/brand/logo/honey-school-logo-reverse.svg"
          width="1080"
        />
        <img
          className="honey-school-lockup__mark"
          height="512"
          src="/brand/logo/honey-school-mark.svg"
          width="512"
        />
      </span>
      <strong>{product}</strong>
    </span>
  );
}
