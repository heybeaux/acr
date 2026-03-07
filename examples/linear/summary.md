# linear

Issue tracking and project management via Linear's GraphQL API. Create, update, search, and comment on issues. Supports ticket references (WH-1465), team queries, workflow state management, and priority assignment.

**Provides:** issue-tracking, project-management, ticket-management
**Requires:** exec (curl for GraphQL calls), linear-api-key
**Triggers:** Ticket identifiers (WH-1234), "create/update/search issue", "linear", "project status"

GraphQL endpoint: https://api.linear.app/graphql. Identifiers for queries, UUIDs for mutations. Priority: 0-4 (None to Low).
