---
name: nextjs
description: Next.js 13+ App Router patterns, Server/Client Components, data fetching, authentication, and deployment. Use when building or modifying Next.js applications, implementing server actions, route handlers, middleware, NextAuth.js authentication, Supabase integration, Stripe payments, or deploying to Vercel/self-hosted environments.
---

# Next.js App Router Patterns

Modern Next.js development using App Router (13+). Focused on production patterns for apps with Supabase + Stripe.

## Quick Reference

### File Conventions

```
app/
├── layout.tsx          # Root layout (required)
├── page.tsx            # Home route (/)
├── loading.tsx         # Loading UI (Suspense boundary)
├── error.tsx           # Error boundary
├── not-found.tsx       # 404 page
├── route.ts            # API route handler
├── [slug]/page.tsx     # Dynamic route
├── [...slug]/page.tsx  # Catch-all route
├── (group)/            # Route group (no URL segment)
├── @modal/             # Parallel route (named slot)
└── _components/        # Private folder (excluded from routing)
```

### Server vs Client Components

```tsx
// Server Component (default) - runs on server only
// ✓ Direct DB access, async/await, secrets, zero JS bundle
async function ProductList() {
  const products = await db.query('SELECT * FROM products');
  return <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>;
}

// Client Component - runs in browser
// ✓ useState, useEffect, event handlers, browser APIs
'use client';
import { useState } from 'react';
export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Rule**: Start with Server Components. Add `'use client'` only when you need interactivity.

### Server Actions

```tsx
// app/actions.ts
'use server';

import { revalidatePath } from 'next/cache';

export async function createProduct(formData: FormData) {
  const name = formData.get('name') as string;
  await db.insert('products', { name });
  revalidatePath('/products');
}

// Usage in component
<form action={createProduct}>
  <input name="name" />
  <button type="submit">Create</button>
</form>
```

### Route Handlers (API Routes)

```tsx
// app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const products = await db.query('SELECT * FROM products');
  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const product = await db.insert('products', body);
  return NextResponse.json(product, { status: 201 });
}
```

### Middleware

```tsx
// middleware.ts (root level)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Auth check
  const token = request.cookies.get('session');
  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};
```

### Data Fetching Patterns

```tsx
// Static (cached forever, revalidate manually)
const data = await fetch(url); // default

// Time-based revalidation
const data = await fetch(url, { next: { revalidate: 3600 } }); // 1 hour

// Dynamic (no cache)
const data = await fetch(url, { cache: 'no-store' });

// Route segment config
export const dynamic = 'force-dynamic'; // or 'force-static'
export const revalidate = 3600; // seconds
```

### Image Optimization

```tsx
import Image from 'next/image';

// Local image
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />

// Remote image (add to next.config.js remotePatterns)
<Image 
  src="https://cdn.example.com/photo.jpg"
  alt="Photo"
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  className="object-cover"
/>
```

### Environment Variables

```bash
# .env.local (git-ignored, local dev)
DATABASE_URL=postgres://...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# .env (committed, defaults)
NEXT_PUBLIC_APP_NAME=MyApp
```

- `NEXT_PUBLIC_*` — exposed to browser
- All others — server-only (never bundle to client)

## Detailed Patterns

- **App Router & Components**: See [references/app-router.md](references/app-router.md)
- **Data Fetching & Caching**: See [references/data-fetching.md](references/data-fetching.md)
- **Authentication (NextAuth + Supabase)**: See [references/auth-patterns.md](references/auth-patterns.md)
- **Deployment & Environment**: See [references/deployment.md](references/deployment.md)

## Common Gotchas

1. **"use client" doesn't mean client-only** — Component still renders on server (SSR), then hydrates
2. **Server Actions need 'use server'** — At top of file or function
3. **cookies()/headers() make route dynamic** — Can't be statically generated
4. **Middleware runs on Edge** — Limited Node.js APIs available
5. **fetch is extended** — Next.js adds caching, don't use axios in Server Components
6. **revalidatePath/revalidateTag** — Use after mutations, not in render
