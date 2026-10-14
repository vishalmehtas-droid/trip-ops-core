import { Field } from "@/components/app/master-data";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLIENT_SOURCES } from "@/lib/master-schemas";

type Props = {
  idPrefix: string;
  source: string;
  referredBy: string;
  errors: Record<string, string>;
  onChange: (source: string, referredBy: string) => void;
};

/** Client source select; "Referred by" appears only for referrals. */
export function ClientSourceFields({ idPrefix, source, referredBy, errors, onChange }: Props) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Source" htmlFor={`${idPrefix}-source`} error={errors["source"]}>
        <Select
          value={source}
          onValueChange={(value) => onChange(value, value === "Referral" ? referredBy : "")}
        >
          <SelectTrigger id={`${idPrefix}-source`}>
            <SelectValue placeholder="Select source" />
          </SelectTrigger>
          <SelectContent>
            {CLIENT_SOURCES.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {source === "Referral" ? (
        <Field
          label="Referred by"
          htmlFor={`${idPrefix}-referred-by`}
          error={errors["referred_by"]}
        >
          <Input
            id={`${idPrefix}-referred-by`}
            maxLength={120}
            value={referredBy}
            onChange={(event) => onChange(source, event.target.value)}
          />
        </Field>
      ) : null}
    </div>
  );
}
