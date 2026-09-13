import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { SALE_STATUS_LABELS, type SaleStatus } from "@/lib/sales-schemas";

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const tone: Record<SaleStatus, string> = {
    pending: "border-warning/40 text-warning",
    confirmed: "border-brand/40 text-brand",
    completed: "border-success/40 text-success",
    cancelled: "border-destructive/40 text-destructive",
  };
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-bold uppercase tracking-wide", tone[status])}
    >
      {SALE_STATUS_LABELS[status]}
    </Badge>
  );
}

export type RecordOption = { id: string; label: string; hint?: string | null };

/** Searchable master-record selector. The UUID is stored, never the label. */
export function RecordCombobox({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled,
  id,
  allowClear,
  onCreateNew,
  createLabel,
}: {
  options: RecordOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  disabled?: boolean;
  id?: string;
  allowClear?: boolean;
  /** When provided, an inline quick-add action is shown inside the list. */
  onCreateNew?: (() => void) | undefined;
  createLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear ? (
                <CommandItem
                  value="__none__"
                  onSelect={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === "" ? "opacity-100" : "opacity-0")} />
                  <span className="text-muted-foreground">None</span>
                </CommandItem>
              ) : null}
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.hint ?? ""}`}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("size-4", value === option.id ? "opacity-100" : "opacity-0")}
                  />
                  <span>{option.label}</span>
                  {option.hint ? (
                    <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
