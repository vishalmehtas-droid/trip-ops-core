import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { InvoiceStatusBadge } from "@/components/app/invoices";
import { formatDate } from "@/components/app/master-data";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, TableSkeleton, UnauthorizedState } from "@/components/app/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/use-auth";
import { listInvoices } from "@/lib/invoices.functions";
import { formatMoney } from "@/lib/sale-costing-schemas";

const DESCRIPTION = "Customer tax invoices issued against bookings.";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — Triptastic Ops" },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: "Invoices — Triptastic Ops" },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: InvoicesPage,
});

function InvoicesPage() {
  const { hasAnyRole } = useAuth();
  const canRead = hasAnyRole(["admin", "accounts", "sales"]);
  const list = useServerFn(listInvoices);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["invoices", {}],
    queryFn: () => list({ data: {} }),
    enabled: canRead,
  });

  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoices" description={DESCRIPTION} />
        <UnauthorizedState description="Invoices are available to Admin, Accounts and Sales." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" description={DESCRIPTION} />
      {query.isLoading ? (
        <TableSkeleton />
      ) : query.isError ? (
        <ErrorState description={(query.error as Error).message} />
      ) : !query.data?.length ? (
        <EmptyState title="No invoices yet" description="Issue an invoice from a booking page." />
      ) : (
        <div className="rounded-lg border border-border bg-surface shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    void navigate({ to: "/invoices/$invoiceId", params: { invoiceId: row.id } })
                  }
                >
                  <TableCell className="font-mono text-xs">{row.invoice_number}</TableCell>
                  <TableCell>{formatDate(row.invoice_date)}</TableCell>
                  <TableCell>{row.client_name}</TableCell>
                  <TableCell>
                    <Link
                      to="/sales/$saleId"
                      params={{ saleId: row.sale_id }}
                      className="font-mono text-xs text-primary hover:underline"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.booking_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(row.total_payable)}
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
