---
name: linear
description: Interact with Linear for issue tracking and project management. Use for creating, updating, searching, and commenting on Linear issues. Triggers on Linear ticket references (e.g., WH-1465), requests to create/update issues, attach files to tickets, or query project status.
---

# Linear Skill

Interact with Linear's GraphQL API for issue management.

## Authentication

API key location: `~/.config/clawdbot/secrets/linear-api-key`

```bash
LINEAR_API_KEY=$(cat ~/.config/clawdbot/secrets/linear-api-key)
```

## API Basics

All requests use GraphQL at `https://api.linear.app/graphql`:

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "YOUR_QUERY"}'
```

## Common Operations

### Get Issue by Identifier

```graphql
query {
  issue(id: "WH-1465") {
    id
    identifier
    title
    description
    state { name }
    assignee { name }
    priority
    url
  }
}
```

### Search Issues

```graphql
query {
  issues(filter: { 
    team: { key: { eq: "WH" } }
    state: { name: { nin: ["Done", "Canceled"] } }
  }, first: 20) {
    nodes {
      identifier
      title
      state { name }
      assignee { name }
    }
  }
}
```

### Create Issue

```graphql
mutation {
  issueCreate(input: {
    teamId: "TEAM_UUID"
    title: "Issue title"
    description: "Description in markdown"
    priority: 2
  }) {
    success
    issue { id identifier url }
  }
}
```

### Update Issue

```graphql
mutation {
  issueUpdate(id: "ISSUE_UUID", input: {
    stateId: "STATE_UUID"
    assigneeId: "USER_UUID"
  }) {
    success
    issue { id identifier }
  }
}
```

### Add Comment (with file content)

For attaching documents, add as a markdown comment:

```bash
# Prepare content as JSON-safe string
cat document.md | python3 -c "
import sys, json
content = sys.stdin.read()
payload = {
    'query': '''mutation(\$input: CommentCreateInput!) {
      commentCreate(input: \$input) {
        success
        comment { id url }
      }
    }''',
    'variables': {
        'input': {
            'issueId': 'ISSUE_UUID',
            'body': content
        }
    }
}
print(json.dumps(payload))
" > /tmp/linear_request.json

curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d @/tmp/linear_request.json
```

### Get Teams

```graphql
query {
  teams {
    nodes {
      id
      key
      name
    }
  }
}
```

### Get Workflow States

```graphql
query {
  workflowStates(filter: { team: { key: { eq: "WH" } } }) {
    nodes {
      id
      name
      type
    }
  }
}
```

### Get Team Members

```graphql
query {
  users {
    nodes {
      id
      name
      email
    }
  }
}
```

## Priority Values

| Value | Label |
|-------|-------|
| 0 | No priority |
| 1 | Urgent |
| 2 | High |
| 3 | Medium |
| 4 | Low |

## Workflow State Types

- `backlog` - Not started
- `unstarted` - Ready to start  
- `started` - In progress
- `completed` - Done
- `canceled` - Won't do

## Tips

- Issue identifiers (e.g., `WH-1465`) work directly in the `issue(id:)` query
- For mutations, use the UUID `id` field, not the identifier
- Comments support full markdown including code blocks
- Large file attachments: add as comment with markdown content
