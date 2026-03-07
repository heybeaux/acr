---
name: db-introspect
description: Database introspection and schema analysis. Use for analyzing database schemas, understanding table relationships, finding anomalies, generating ERDs, and documenting database structure. Works with PostgreSQL, Supabase, MySQL, and SQLite.
---

# Database Introspection

Analyze database schemas, relationships, and structure.

## Capabilities

1. **Schema Analysis** — Extract table definitions, columns, types, constraints
2. **Relationship Mapping** — Identify foreign keys, junction tables, entity relationships
3. **Index Analysis** — Review indexing strategy, find missing indexes
4. **Data Profiling** — Sample data distributions, null rates, cardinality
5. **Documentation Generation** — Create schema docs, ERDs, data dictionaries

## Quick Commands

### PostgreSQL / Supabase

```sql
-- List all tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';

-- Get table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns WHERE table_name = '<table>';

-- Foreign keys
SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';

-- Indexes
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public';

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) 
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;
```

### Supabase-Specific

```bash
# Use Supabase CLI for introspection
supabase db dump --schema-only > schema.sql
supabase inspect db table-sizes
supabase inspect db index-sizes
supabase inspect db unused-indexes
```

### MySQL

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE();
```

### SQLite

```sql
SELECT name FROM sqlite_master WHERE type='table';
PRAGMA table_info(<table>);
PRAGMA foreign_key_list(<table>);
```

## Analysis Workflow

1. **Discover** — List all tables, views, functions
2. **Map** — Identify relationships and dependencies
3. **Profile** — Analyze data patterns and distributions
4. **Assess** — Check for issues (missing FKs, no indexes, orphaned tables)
5. **Document** — Generate schema documentation

## Output Formats

- **Markdown** — Human-readable schema docs
- **Mermaid ERD** — Entity relationship diagrams
- **JSON Schema** — Machine-readable structure
- **SQL DDL** — Recreatable schema definitions

## Red Flags to Check

- Tables without primary keys
- Foreign keys without indexes
- Large tables without indexes
- Nullable columns that shouldn't be
- Orphaned junction tables
- Inconsistent naming conventions
- Missing audit columns (created_at, updated_at)
