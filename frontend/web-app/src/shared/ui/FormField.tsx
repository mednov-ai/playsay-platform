import type { ReactNode } from "react";

type FormFieldProps = {
  children: ReactNode;
  label: string;
};

export function FormField({ children, label }: FormFieldProps) {
  return (
    <label className="grid gap-1 text-xs font-extrabold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}
