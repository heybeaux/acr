---
name: nestjs
description: NestJS backend development patterns for WhaleHawk. Use when scaffolding modules/services/controllers, implementing guards/interceptors, integrating Prisma, writing tests, creating custom decorators, handling errors, scheduling tasks, or managing configuration. Covers DI best practices, exception filters, and e2e testing patterns.
---

# NestJS Patterns

## Quick Reference

| Task | Reference |
|------|-----------|
| Module/service/controller scaffolding | [references/modules-di.md](references/modules-di.md) |
| Guards & interceptors | [references/guards-interceptors.md](references/guards-interceptors.md) |
| Prisma integration | [references/prisma.md](references/prisma.md) |
| Unit & e2e testing | [references/testing.md](references/testing.md) |
| Custom decorators | [references/decorators.md](references/decorators.md) |
| Error handling | [references/error-handling.md](references/error-handling.md) |
| Scheduled tasks | [references/scheduling.md](references/scheduling.md) |
| Configuration | [references/config.md](references/config.md) |

## Core Conventions

### File Structure
```
src/
├── modules/
│   └── {feature}/
│       ├── {feature}.module.ts
│       ├── {feature}.controller.ts
│       ├── {feature}.service.ts
│       ├── dto/
│       ├── entities/
│       └── {feature}.spec.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   └── interceptors/
└── prisma/
    └── prisma.service.ts
```

### Naming
- **Modules**: `{Feature}Module` → `users.module.ts`
- **Services**: `{Feature}Service` → `users.service.ts`
- **Controllers**: `{Feature}Controller` → `users.controller.ts`
- **DTOs**: `Create{Feature}Dto`, `Update{Feature}Dto`
- **Guards**: `{Purpose}Guard` → `jwt-auth.guard.ts`
- **Interceptors**: `{Purpose}Interceptor` → `logging.interceptor.ts`

### Essential Patterns

**Module with providers:**
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

**Service with Prisma:**
```typescript
@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
  
  findAll() {
    return this.prisma.user.findMany();
  }
}
```

**Controller with validation:**
```typescript
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }
}
```

## CLI Commands

```bash
# Generate module with service, controller
nest g resource users --no-spec

# Generate individual components
nest g module users
nest g service users
nest g controller users
nest g guard auth
nest g interceptor logging
nest g filter http-exception
```
