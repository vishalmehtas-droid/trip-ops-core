import { Lock } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";

export function PlaceholderPage({
  title,
  description,
  phase,
  scope,
}: {
  title: string;
  description: string;
  phase: number;
  scope: string[];
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        badge={
          <Badge
            variant="outline"
            className="border-border text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            Phase {phase}
          </Badge>
        }
      />

      <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-full border border-border bg-background text-muted-foreground">
          <Lock className="size-5" />
        </div>
        <h2 className="mt-4 text-sm font-semibold text-foreground">Coming in Phase {phase}</h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
          This module is not implemented yet. Phase 1 delivers the secure application foundation
          only — no financial records, calculations or documents are generated.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {scope.map((item) => (
            <span
              key={item}
              className="rounded border border-border bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
