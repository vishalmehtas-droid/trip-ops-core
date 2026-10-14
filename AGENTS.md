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
- Supplier comparison and customer line pickers share latest eligible quote selection per vendor to keep the two views consistent.
