import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listSupplierQuotes } from "@/lib/supplier-quotes.functions";
import { listCustomerQuotes } from "@/lib/customer-quotes.functions";

export function RequirementNextStep({
  requirementId,
  onOpenCustomerQuote,
  onOpenSupplierQuote,
}: {
  requirementId: string;
  onOpenCustomerQuote?: ((id: string) => void) | undefined;
  onOpenSupplierQuote?: ((id: string) => void) | undefined;
}) {
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
  const supplierTarget = supplier[0]?.id;
  const booking = customer
    ? Array.isArray(customer.booking)
      ? customer.booking[0]
      : customer.booking
    : null;
  const hint =
    customer?.status === "accepted"
      ? booking
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

  const action =
    customer?.status === "accepted" && booking
      ? { kind: "booking" as const, id: booking.id, bookingNumber: booking.booking_number }
      : customer
        ? { kind: "customer" as const, id: customer.id }
        : supplierTarget
          ? { kind: "supplier" as const, id: supplierTarget }
          : null;

  return (
    <p className="mt-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Next step:</span>{" "}
      {action?.kind === "booking" ? (
        <Link
          to="/sales/$saleId"
          params={{ saleId: action.id }}
          className="font-medium text-primary hover:underline"
        >
          {hint}
        </Link>
      ) : action?.kind === "customer" && onOpenCustomerQuote ? (
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => onOpenCustomerQuote(action.id)}
        >
          {hint}
        </button>
      ) : action?.kind === "supplier" && onOpenSupplierQuote ? (
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => onOpenSupplierQuote(action.id)}
        >
          {hint}
        </button>
      ) : (
        hint
      )}
    </p>
  );
}
