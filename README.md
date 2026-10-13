# Triptastic Ops Core

PROJECT: Triptastic Holidays Operations Management System

We are building a production-oriented internal Operations & Finance Management application for Triptastic Holidays LLP.

IMPORTANT DEVELOPMENT APPROACH:

Do NOT build the entire application at once.

This is PHASE 1 ONLY.

Do not implement Sales, Purchases, Receipts, Payments, GST reports, WhatsApp, email automation or PDF generation yet.

The objective of this phase is to establish a clean, secure and extensible application foundation.

TECHNOLOGY:

Use the Lovable standard full-stack TypeScript architecture with:

- React

- TypeScript

- Tailwind

- shadcn/ui

- Supabase/PostgreSQL for the backend and database

- Supabase Authentication

- Row Level Security

The database must be the source of truth.

Do not rely on frontend-only permission checks.

==================================================

1. APPLICATION STRUCTURE

==================================================

Create the basic application shell with:

- Login

- Logout

- Protected application area

- Sidebar navigation

- Top navigation/header

- User profile menu

- Dashboard placeholder

- Settings placeholder

- Responsive layout

The visual design should feel like a professional travel-company internal operations system.

Use a clean, modern interface.

Avoid excessive visual decoration.

Prioritize:

- readability

- fast navigation

- tables

- forms

- clear status indicators

- desktop usability

==================================================

2. AUTHENTICATION

==================================================

Implement Supabase Authentication.

Users must authenticate before accessing the application.

Unauthenticated users must not be able to access protected application routes.

Implement:

- Login

- Logout

- Session persistence

- Protected routes

- Basic authentication error handling

Do not build public user registration.

Users will be created/managed by an administrator.

==================================================

3. USER ROLES

==================================================

Create these application roles:

- Admin

- Sales

- Operations

- Accounts

- Viewer

For Phase 1, implement the role architecture and permission framework.

Do not yet implement module-specific permissions for Sales/Purchases/Receipts because those modules are not being built in this phase.

The permission architecture must be designed so future modules can use it.

==================================================

4. DATABASE

==================================================

Enable Supabase/PostgreSQL.

Create the users/profile structure needed for authenticated users.

Use the authenticated Supabase user ID as the identity reference.

Create an application profiles/users table containing:

- id

- name

- email

- role

- is_active

- created_at

- updated_at

Use appropriate PostgreSQL types.

Do not duplicate authentication credentials in the application database.

The auth user ID should be the primary identity relationship.

==================================================

5. ROLE SECURITY

==================================================

Implement Row Level Security.

Do not rely only on hiding UI elements.

The database/API layer must enforce authorization.

Admin:

- full access

Sales:

- establish role identity but no financial module permissions yet

Operations:

- establish role identity but no financial module permissions yet

Accounts:

- establish role identity but no financial module permissions yet

Viewer:

- read-only role architecture

Make the permission system extensible for future modules.

==================================================

6. AUDIT FOUNDATION

==================================================

Create the foundation for an audit log.

Audit records should support:

- id

- user_id

- action

- entity_type

- entity_id

- old_values

- new_values

- created_at

Do not yet build detailed financial audit workflows.

The purpose of Phase 1 is to establish the infrastructure.

==================================================

7. NAVIGATION

==================================================

Create the following navigation structure.

Dashboard

Operations

- Sales

- Purchases

Finance

- Receipts

- Payments

Masters

- Clients

- Vendors

- Destinations

Reports

- Client Ledger

- Vendor Ledger

- Cashflow

- Profitability

- GST

Administration

- Users

- Settings

- Audit Log

For Phase 1, these pages can display an appropriate "Coming in Phase X" placeholder.

Do NOT build the actual functionality yet.

==================================================

8. ERROR HANDLING

==================================================

Create a consistent application approach for:

- loading states

- empty states

- error states

- unauthorized states

- confirmation dialogs

- success notifications

- form validation

==================================================

9. IMPORTANT FINANCIAL PRINCIPLE

==================================================

This application will eventually manage real financial data.

Therefore:

- Never use floating-point arithmetic for persisted monetary values.

- Use PostgreSQL numeric/decimal types for money.

- Store currency explicitly where relevant.

- Never allow frontend-only calculations to be treated as authoritative financial records.

- Future financial calculations must be validated server-side/database-side.

- Do not create fake financial data.

==================================================

10. DO NOT IMPLEMENT YET

==================================================

Do NOT build:

- Sales

- Sales Items

- Invoices

- Purchases

- Purchase Items

- Vendor Bills

- Receipts

- Payments

- GST calculations

- Client ledger

- Vendor ledger

- P&L

- WhatsApp

- Email

- Google Sheets

- PDF generation

These will be implemented in later phases.

==================================================

11. PHASE 1 COMPLETION REQUIREMENT

==================================================

Before considering this phase complete:

Verify that:

1. User can log in.

2. User can log out.

3. Protected routes cannot be accessed without authentication.

4. User profile is loaded correctly.

5. Role is loaded correctly.

6. Admin role is recognized.

7. Different roles are recognized.

8. Database RLS is active.

9. Unauthorized database access is rejected.

10. Navigation works.

11. Placeholder pages load correctly.

12. Application works on desktop and mobile widths.

13. No TypeScript/build errors remain.

14. No fake financial functionality has been introduced.

At the end, provide a concise implementation summary and identify anything intentionally deferred to Phase 2.

Do not proceed to Phase 2 automatically.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trip-ops-core.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/875b5ad1-a5b0-4e3f-a982-0aef14063465).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
