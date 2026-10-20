import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { InvoiceDocument, InvoiceStatusBadge } from "@/components/app/invoices";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState, UnauthorizedState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { cancelInvoice, getInvoice } from "@/lib/invoices.functions";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — Triptastic Ops" },
      { name: "description", content: "Customer tax invoice with print layout." },
      { property: "og:title", content: "Invoice — Triptastic Ops" },
      { property: "og:description", content: "Customer tax invoice with print layout." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { invoiceId } = Route.useParams();
  const { hasAnyRole, isAdmin } = useAuth();
  const canRead = hasAnyRole(["admin", "accounts", "sales"]);
  const fetchInvoice = useServerFn(getInvoice);
  const cancel = useServerFn(cancelInvoice);
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["invoices", "detail", invoiceId],
    queryFn: () => fetchInvoice({ data: { id: invoiceId } }),
    enabled: canRead,
  });

  const mutation = useMutation({
    mutationFn: () => cancel({ data: { id: invoiceId, reason } }),
    onSuccess: async () => {
      toast.success("Invoice cancelled");
      setCancelOpen(false);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-log"] });
    },
    onError: (error: Error) =>
      toast.error("Could not cancel the invoice", { description: error.message }),
  });

  if (!canRead)
    return <UnauthorizedState description="Invoices are available to Admin, Accounts and Sales." />;
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState description={(query.error as Error).message} />;
  const inv = query.data;
  if (!inv) return <ErrorState description="This invoice is not available." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground print:hidden">
        <ArrowLeft className="size-3.5" />
        <Link to="/invoices" className="hover:underline">
          Invoices
        </Link>
      </div>
      <div className="print:hidden">
        <PageHeader
          title={inv.invoice_number}
          description={`${inv.client_name} · ${inv.booking_number}`}
          badge={<InvoiceStatusBadge status={inv.status} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/sales/$saleId" params={{ saleId: inv.sale_id }}>
                  Open booking
                </Link>
              </Button>
              <Button size="sm" onClick={() => window.print()}>
                <Printer className="size-3.5" />
                Print / Save as PDF
              </Button>
              {isAdmin && inv.status === "issued" ? (
                <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel invoice
                </Button>
              ) : null}
            </div>
          }
        />
        {inv.status === "cancelled" ? (
          <p className="mt-2 text-xs text-destructive">
            Cancelled: {inv.cancel_reason}. The number is kept; issue a new invoice from the
            booking.
          </p>
        ) : null}
      </div>

      <InvoiceDocument
        invoiceNumber={inv.invoice_number}
        invoiceDate={inv.invoice_date}
        status={inv.status}
        snapshot={inv.snapshot}
        logoUrl={inv.logoUrl}
      />

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel invoice {inv.invoice_number}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            The number stays used. The booking can then be invoiced again under a new number.
          </p>
          <Textarea
            placeholder="Reason (required)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              Keep invoice
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 3 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Cancel invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
