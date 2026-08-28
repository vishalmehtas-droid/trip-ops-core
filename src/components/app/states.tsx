import { AlertTriangle, Inbox, Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Consistent panel wrapper used by every state below. */
function StatePanel({
  icon,
  title,
  description,
  action,
  tone = "muted",
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "muted" | "danger" | "brand";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "grid size-11 place-items-center rounded-full border border-border bg-background",
          tone === "danger" && "border-destructive/30 text-destructive",
          tone === "brand" && "border-brand/30 text-brand",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <StatePanel
      icon={<Loader2 className="size-5 animate-spin" />}
      title={label}
      description="Fetching the latest records from the database."
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title = "No records yet",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <StatePanel
      icon={<Inbox className="size-5" />}
      title={title}
      {...(description ? { description } : {})}
      {...(action ? { action } : {})}
    />
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "The request could not be completed. Please retry.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <StatePanel
      tone="danger"
      icon={<AlertTriangle className="size-5" />}
      title={title}
      description={description}
      {...(onRetry
        ? {
            action: (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            ),
          }
        : {})}
    />
  );
}

export function UnauthorizedState({
  description = "Your role does not have permission to view this information. Contact an administrator if you need access.",
}: {
  description?: string;
}) {
  return (
    <StatePanel
      tone="danger"
      icon={<Lock className="size-5" />}
      title="Not authorised"
      description={description}
    />
  );
}
