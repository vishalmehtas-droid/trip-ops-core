<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Supplier quotes live under Travel Requirements (no own route); numbering, INR amounts, status transitions and line locks are enforced by DB triggers — server functions only validate and pass through.
- Customer quotation screens live under Travel Requirements and use existing secure server functions; draft financial previews use exact decimal integers for display only, while saved totals remain database-authoritative.
- Quote entry controls share currency selection and exact decimal preview helpers; customer manual entry maps its calculator into the existing total-INR field only, because no FX or price-basis snapshot exists on manual lines.
- Requirement progress hints reuse the existing quote query keys and secure reads, so quote updates refresh guidance without a separate persisted workflow.
- Supplier comparison and customer line pickers share latest eligible quote selection per vendor to keep the two views consistent.
- Accepted quote conversion is one permission-checked PostgreSQL transaction with a unique immutable sales quote link; existing triggers calculate totals and the transaction aborts unless they match the source quote exactly.
- Converted bookings retain all ordered requirement stops in an immutable itinerary snapshot and use the first stop as the existing primary destination; expected-cost snapshot rows use quantity one to preserve the exact total without unit rounding.
- Booking links use the existing UUID identifier with a BK display prefix; do not invent a separate booking number sequence.
- Purchases: numbers, creator, INR amount and cancel rules are set by DB triggers; variance totals are aggregated in exact paise from text-cast numerics on the server — never floats.
- Booking numbers (BK-xxxxxx) are assigned only by a DB insert trigger and are immutable; display them instead of UUIDs.
- Vendor payments/receipts: numbers, creator, allocation caps (payment amount, purchase INR, same vendor/booking) and the receipt cap at customer payable are enforced by DB triggers; payments save atomically via the save_vendor_payment RPC; cancelled records stay and are excluded from totals; purchases, payments and receipts are blocked only on cancelled bookings.
- Shared customer quotes are read only through the anon-executable get_shared_customer_quote RPC, which returns a customer-safe whitelist and records views; never expose customer_quotes to anon directly.
- Ledger reports (client/vendor) are read-only server functions over existing tables with role gates in canAccessLedger (Admin/Accounts full; Sales/Operations client ledger limited to clients with their own bookings; Viewer none); balances aggregate in exact paise, and cancelled bookings/purchases/payments/receipts are excluded (cancelled bookings only when they have recorded receipts).
- Customer tax invoices are issued and cancelled only through the issue_invoice/cancel_invoice database functions: gapless per-financial-year numbering via invoice_counters, an immutable jsonb snapshot (no vendor/cost data), one active invoice per booking; invoice rows have no direct write grants.
