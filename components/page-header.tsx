import type { ReactNode } from "react";
import { ServiceOrderTrackingActions } from "@/components/service-order-tracking-actions";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-slate-200/80 pb-5">
      <div className="space-y-1.5">
        {eyebrow ? (
          <span className="inline-flex items-center rounded-md bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-bold text-primary">
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-2xl font-black tracking-tight text-slate-900">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-sm font-medium text-slate-600 leading-normal">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2.5 shrink-0">
        <ServiceOrderTrackingActions />
        {actions}
      </div>
    </header>
  );
}
