# Hermes Agency OS — Project Documentation

This folder contains the living technical documentation for the **Hermes Agentic SEO** platform.

## Documents

| File | Description |
|---|---|
| [architecture.md](./architecture.md) | Full frontend + backend architecture overview with diagrams |
| [gap_analysis.md](./gap_analysis.md) | Gap analysis: V1 vs. target multi-department Agency OS vision |
| [database_schema.md](./database_schema.md) | Full database schema reference with all tables, relationships, and RLS policies |
| [departments_setup.md](./departments_setup.md) | Phase 2 multi-department migration guide and implementation notes |

## Quick Reference

- **Stack**: Next.js 15 (App Router) + Supabase + Hermes AI
- **Current Phase**: Phase 1 — SEO Department (Active)
- **Next Phase**: Phase 2 — Harden foundation for multi-department support
- **Migration to run**: `supabase/migrations/007_departments_schema.sql`
