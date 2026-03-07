# Modules & Dependency Injection

## Table of Contents
- [Module Structure](#module-structure)
- [Dependency Injection Patterns](#dependency-injection-patterns)
- [Dynamic Modules](#dynamic-modules)
- [Circular Dependencies](#circular-dependencies)

## Module Structure

### Feature Module
```typescript
// users/users.module.ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService], // Export for use in other modules
})
export class UsersModule {}
```

### Global Module
```typescript
// prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Available everywhere without importing
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### App Module
```typescript
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
```

## Dependency Injection Patterns

### Constructor Injection (Preferred)
```typescript
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}
}
```

### Custom Provider Token
```typescript
// Define token
export const CACHE_MANAGER = Symbol('CACHE_MANAGER');

// Register provider
@Module({
  providers: [
    {
      provide: CACHE_MANAGER,
      useClass: RedisCacheManager,
    },
  ],
})
export class CacheModule {}

// Inject with token
@Injectable()
export class UsersService {
  constructor(@Inject(CACHE_MANAGER) private cache: CacheManager) {}
}
```

### Factory Provider
```typescript
@Module({
  providers: [
    {
      provide: 'DATABASE_CONNECTION',
      useFactory: async (config: ConfigService) => {
        return createConnection({
          host: config.get('DB_HOST'),
          port: config.get('DB_PORT'),
        });
      },
      inject: [ConfigService],
    },
  ],
})
export class DatabaseModule {}
```

### Class Provider (Interface Binding)
```typescript
// Bind interface to implementation
@Module({
  providers: [
    {
      provide: 'IUserRepository',
      useClass: PrismaUserRepository,
    },
  ],
})
export class UsersModule {}

@Injectable()
export class UsersService {
  constructor(@Inject('IUserRepository') private repo: IUserRepository) {}
}
```

### Async Provider
```typescript
{
  provide: 'ASYNC_SERVICE',
  useFactory: async (): Promise<AsyncService> => {
    const service = new AsyncService();
    await service.initialize();
    return service;
  },
}
```

## Dynamic Modules

### forRoot / forRootAsync Pattern
```typescript
// cache.module.ts
@Module({})
export class CacheModule {
  static forRoot(options: CacheOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      providers: [
        { provide: 'CACHE_OPTIONS', useValue: options },
        CacheService,
      ],
      exports: [CacheService],
    };
  }

  static forRootAsync(options: CacheAsyncOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      imports: options.imports || [],
      providers: [
        {
          provide: 'CACHE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        CacheService,
      ],
      exports: [CacheService],
    };
  }
}

// Usage
@Module({
  imports: [
    CacheModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        ttl: config.get('CACHE_TTL'),
        host: config.get('REDIS_HOST'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## Circular Dependencies

### Forward Reference
```typescript
// users.module.ts
@Module({
  imports: [forwardRef(() => PostsModule)],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

// posts.module.ts
@Module({
  imports: [forwardRef(() => UsersModule)],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}

// In service
@Injectable()
export class UsersService {
  constructor(
    @Inject(forwardRef(() => PostsService))
    private postsService: PostsService,
  ) {}
}
```

### Avoiding Circular Dependencies
Better: Extract shared logic to a separate module:
```typescript
// shared/shared.module.ts
@Module({
  providers: [SharedService],
  exports: [SharedService],
})
export class SharedModule {}

// Both UsersModule and PostsModule import SharedModule
```

## Request-Scoped Providers

```typescript
@Injectable({ scope: Scope.REQUEST })
export class RequestScopedService {
  constructor(@Inject(REQUEST) private request: Request) {}
}
```

**Scopes:**
- `Scope.DEFAULT` - Singleton (default)
- `Scope.REQUEST` - New instance per request
- `Scope.TRANSIENT` - New instance per injection
