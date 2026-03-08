# gc-storybook

Storybook component story authoring for the GC project.

**CRITICAL:** Always import from `@storybook/nextjs`, never from `@storybook/react`.

```typescript
import type { Meta, StoryObj } from '@storybook/nextjs';
```

Use `composeStories` for portable stories. Follow CSF3 format.
