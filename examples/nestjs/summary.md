# nestjs

NestJS backend development patterns and conventions. Covers module/service/controller scaffolding, Prisma integration, guards and interceptors, custom decorators, error handling with exception filters, scheduled tasks, configuration management, and testing (unit + e2e).

**Provides:** nestjs-development, backend-development, api-development
**Requires:** exec (nest CLI, npm commands)
**Triggers:** "nestjs", "nest generate", module/service/controller/guard/interceptor mentions, nest-cli.json detected

Convention: src/modules/{feature}/ structure. DI via constructor. PrismaService for DB. class-validator DTOs. 8 reference docs available at deep resolution covering all major patterns.
