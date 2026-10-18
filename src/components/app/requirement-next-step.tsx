import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSupplierQuotes } from "@/lib/supplier-quotes.functions";
import { listCustomerQuotes } from "@/lib/customer-quotes.functions";

export function RequirementNextStep({ requirementId }: { requirementId: string }) {
  const supplierFn = useServerFn(listSupplierQuotes);
  const customerFn = useServerFn(listCustomerQuotes);
  const suppliers = useQuery({
    queryKey: ["supplier-quotes", requirementId],
    queryFn: () => supplierFn({ data: { requirement_id: requirementId } }),
  });
  const customers = useQuery({
    queryKey: ["customer-quotes", requirementId],
    queryFn: () => customerFn({ data: { requirement_id: requirementId } }),
  });
  if (suppliers.isPending || customers.isPending || suppliers.isError || customers.isError)
    return null;
  const customer = [...customers.data]
    .filter((quote) => quote.status !== "superseded")
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.revision_no - a.revision_no)[0];
  const supplier = suppliers.data.filter(
    (quote) => !quote.is_superseded && quote.status !== "rejected",
  );
  const hint =
    customer?.status === "accepted"
      ? (Array.isArray(customer.booking) ? customer.booking.length > 0 : Boolean(customer.booking))
        ? "Open the linked booking."
        : "Convert the accepted customer quote to booking."
      : customer?.status === "sent"
        ? "Accept the customer quote when the customer confirms."
        : customer?.status === "draft"
          ? "Set pricing and send the customer quote."
          : customer?.status === "rejected" || customer?.status === "expired"
            ? "Create a customer quote revision."
            : supplier.some((quote) => quote.status === "received" || quote.status === "selected")
              ? "Build the customer quote from the supplier lines."
              : supplier.some((quote) => quote.status === "requested")
                ? "Mark the supplier quote as Received when it arrives."
                : "Add a supplier quote for this requirement.";
  return (
    <p className="mt-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Next step:</span> {hint}
    </p>
  );
}
