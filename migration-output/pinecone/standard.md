---
name: pinecone
description: Vector database operations with Pinecone for RAG applications. Use when working with embeddings, semantic search, vector upserts/queries/deletes, namespace management, index operations, or building retrieval-augmented generation pipelines. Covers Python SDK and REST API patterns.
---

# Pinecone Vector Database

## Quick Reference

```python
from pinecone import Pinecone
pc = Pinecone(api_key="YOUR_API_KEY")
index = pc.Index("your-index")
```

## Vector Operations

### Upsert

```python
# Single vector
index.upsert(vectors=[
    {"id": "doc1", "values": [0.1, 0.2, ...], "metadata": {"title": "Doc 1", "category": "tech"}}
], namespace="my-namespace")

# Batch upsert (recommended: chunks of 100)
index.upsert(vectors=vectors_list, namespace="ns")
```

### Query

```python
results = index.query(
    vector=[0.1, 0.2, ...],
    top_k=10,
    namespace="my-namespace",
    include_metadata=True,
    include_values=False,  # saves bandwidth
    filter={"category": {"$eq": "tech"}}
)
for match in results.matches:
    print(f"{match.id}: {match.score} - {match.metadata}")
```

### Fetch & Delete

```python
# Fetch by IDs
fetched = index.fetch(ids=["doc1", "doc2"], namespace="ns")

# Delete by IDs
index.delete(ids=["doc1", "doc2"], namespace="ns")

# Delete by filter
index.delete(filter={"category": {"$eq": "outdated"}}, namespace="ns")

# Delete entire namespace
index.delete(delete_all=True, namespace="ns")
```

## Metadata Filtering

```python
# Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists
filter = {
    "$and": [
        {"category": {"$in": ["tech", "science"]}},
        {"date": {"$gte": "2024-01-01"}},
        {"archived": {"$ne": True}}
    ]
}

# Combine with query
results = index.query(vector=embedding, top_k=5, filter=filter)
```

## Namespace Management

Namespaces partition data within an index. No explicit create needed—upsert creates them.

```python
# List namespaces
stats = index.describe_index_stats()
for ns, info in stats.namespaces.items():
    print(f"{ns}: {info.vector_count} vectors")

# Delete namespace
index.delete(delete_all=True, namespace="old-namespace")
```

## Index Management

```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key="YOUR_API_KEY")

# Create index
pc.create_index(
    name="my-index",
    dimension=1536,  # OpenAI ada-002
    metric="cosine",  # or euclidean, dotproduct
    spec=ServerlessSpec(cloud="aws", region="us-east-1")
)

# List indexes
for idx in pc.list_indexes():
    print(idx.name)

# Describe index
desc = pc.describe_index("my-index")
print(f"Dimension: {desc.dimension}, Metric: {desc.metric}")

# Delete index
pc.delete_index("my-index")
```

## RAG Pattern

```python
def rag_query(query: str, index, embed_fn, top_k=5, namespace="default"):
    """Standard RAG retrieval pattern."""
    query_embedding = embed_fn(query)
    results = index.query(
        vector=query_embedding,
        top_k=top_k,
        namespace=namespace,
        include_metadata=True
    )
    context = "\n\n".join([
        f"[{m.id}] {m.metadata.get('text', '')}" 
        for m in results.matches
    ])
    return context, results.matches
```

## Batch Operations

For bulk operations, use `scripts/batch_upsert.py` and `scripts/batch_delete.py`.

```bash
# Bulk upsert from JSONL
python scripts/batch_upsert.py --index my-index --file data.jsonl --namespace prod

# Bulk delete by filter
python scripts/batch_delete.py --index my-index --filter '{"status": {"$eq": "archived"}}'
```

## TypeScript/NestJS Integration

For WhaleHawk backend, use `@pinecone-database/pinecone`:

```typescript
import { Pinecone } from '@pinecone-database/pinecone';

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const index = pc.index('my-index');

// Upsert
await index.namespace('prod').upsert([
  { id: 'doc1', values: embedding, metadata: { title: 'Doc 1' } }
]);

// Query
const results = await index.namespace('prod').query({
  vector: queryEmbedding,
  topK: 10,
  includeMetadata: true,
  filter: { category: { $eq: 'tech' } }
});
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/batch_upsert.py` | Bulk upsert from JSONL with progress |
| `scripts/batch_delete.py` | Bulk delete by IDs or filter |
| `scripts/index_stats.py` | Show index and namespace statistics |
| `scripts/export_namespace.py` | Export namespace vectors to JSONL |

## Reference

- Detailed metadata filtering: See `references/metadata-filters.md`
- Embedding dimension reference: OpenAI ada-002=1536, text-embedding-3-small=1536, text-embedding-3-large=3072
