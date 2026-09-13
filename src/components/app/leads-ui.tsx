import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LEAD_STATUS_LABELS,
  REQUIREMENT_STATUS_LABELS,
  type LeadStatus,
  type RequirementStatus,
} from "@/lib/leads-schemas";

const LEAD_TONE: Record<LeadStatus, string> = {
  new: "border-brand/40 text-brand",
  in_progress: "border-warning/40 text-warning",
  quoted: "border-accent/40 text-accent",
  negotiation: "border-warning/40 text-warning",
  won: "border-success/40 text-success",
  lost: "border-destructive/40 text-destructive",
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-bold uppercase tracking-wide", LEAD_TONE[status])}
    >
      {LEAD_STATUS_LABELS[status]}
    </Badge>
  );
}

const REQUIREMENT_TONE: Record<RequirementStatus, string> = {
  draft: "border-muted-foreground/40 text-muted-foreground",
  active: "border-success/40 text-success",
  superseded: "border-warning/40 text-warning",
  closed: "border-destructive/40 text-destructive",
};

export function RequirementStatusBadge({ status }: { status: RequirementStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-bold uppercase tracking-wide", REQUIREMENT_TONE[status])}
    >
      {REQUIREMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
