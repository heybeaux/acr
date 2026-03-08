# gc-storybook — Standard Reference

## Overview

Storybook story authoring for the GC (Generosity Catalyst) project using the Next.js framework adapter.

## Import Pattern

**CRITICAL:** Always use the Next.js framework adapter, never the raw React renderer:

```typescript
// ✅ CORRECT
import type { Meta, StoryObj } from '@storybook/nextjs';

// ❌ WRONG — will trigger lint error: storybook/no-renderer-packages
import type { Meta, StoryObj } from '@storybook/react';
```

## Story Format (CSF3)

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    variant: 'primary',
    children: 'Click me',
  },
};
```

## Portable Stories

Use `composeStories` for reusable story instances in tests:

```typescript
import { composeStories } from '@storybook/nextjs';
import * as stories from './Button.stories';

const { Primary, Secondary } = composeStories(stories);
```

## Commands

- `pnpm storybook` — Dev server
- `pnpm build-storybook` — Production build
- `pnpm test-storybook` — Interaction tests
