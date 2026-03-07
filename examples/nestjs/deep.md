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
-e 

---

# Reference Documentation

-e 
## config

# Configuration Management

## Table of Contents
- [Setup](#setup)
- [Environment Variables](#environment-variables)
- [Typed Configuration](#typed-configuration)
- [Validation](#validation)
- [Namespaced Configuration](#namespaced-configuration)

## Setup

```bash
npm install @nestjs/config
```

```typescript
// app.module.ts
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Available everywhere
      envFilePath: ['.env.local', '.env'],
      cache: true, // Cache env vars for performance
    }),
  ],
})
export class AppModule {}
```

## Environment Variables

### Basic Usage
```typescript
// .env
DATABASE_URL=postgresql://user:pass@localhost:5432/db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1d
PORT=3000
```

```typescript
// Using ConfigService
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  getJwtSecret(): string {
    return this.configService.get<string>('JWT_SECRET');
  }

  getJwtExpiry(): string {
    return this.configService.getOrThrow<string>('JWT_EXPIRES_IN'); // Throws if missing
  }

  getPort(): number {
    return this.configService.get<number>('PORT', 3000); // With default
  }
}
```

### In main.ts
```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
```

## Typed Configuration

### Configuration Factory
```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
    poolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  },
});
```

```typescript
// app.module.ts
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
})
export class AppModule {}
```

```typescript
// Usage
@Injectable()
export class DatabaseService {
  constructor(private configService: ConfigService) {}

  getPoolSize(): number {
    return this.configService.get<number>('database.poolSize');
  }
}
```

### Type-Safe Configuration Interface
```typescript
// config/config.interface.ts
export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
}

export interface DatabaseConfig {
  url: string;
  poolSize: number;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshExpiresIn: string;
}

export interface RedisConfig {
  host: string;
  port: number;
}
```

## Validation

### With Joi
```bash
npm install joi
```

```typescript
// config/config.validation.ts
import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRES_IN: Joi.string().default('1d'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
});
```

```typescript
// app.module.ts
import { validationSchema } from './config/config.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
      validationOptions: {
        abortEarly: false, // Show all errors
        allowUnknown: true, // Allow extra env vars
      },
    }),
  ],
})
export class AppModule {}
```

### With class-validator
```typescript
// config/env.validation.ts
import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsString, MinLength, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  
  return validatedConfig;
}
```

```typescript
// app.module.ts
import { validate } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
  ],
})
export class AppModule {}
```

## Namespaced Configuration

### Separate Config Files
```typescript
// config/database.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  poolSize: parseInt(process.env.DB_POOL_SIZE, 10) || 10,
  logging: process.env.DB_LOGGING === 'true',
}));
```

```typescript
// config/jwt.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
}));
```

```typescript
// config/redis.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
}));
```

```typescript
// app.module.ts
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig, redisConfig],
    }),
  ],
})
export class AppModule {}
```

### Injecting Namespaced Config
```typescript
// Using ConfigService
@Injectable()
export class AuthService {
  constructor(private configService: ConfigService) {}

  getJwtConfig() {
    return {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: this.configService.get<string>('jwt.expiresIn'),
    };
  }
}

// Using @Inject with ConfigType
import { ConfigType } from '@nestjs/config';
import jwtConfig from './config/jwt.config';

@Injectable()
export class AuthService {
  constructor(
    @Inject(jwtConfig.KEY)
    private jwt: ConfigType<typeof jwtConfig>,
  ) {}

  getJwtSecret(): string {
    return this.jwt.secret; // Fully typed!
  }
}
```

## Environment-Specific Files

```typescript
ConfigModule.forRoot({
  envFilePath: [
    `.env.${process.env.NODE_ENV}.local`, // .env.development.local
    `.env.${process.env.NODE_ENV}`,        // .env.development
    '.env.local',
    '.env',
  ],
})
```

Load order (last wins):
1. `.env`
2. `.env.local`
3. `.env.development`
4. `.env.development.local`

## Async Configuration

```typescript
// For modules that need async config
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AuthModule {}
```

-e 
## decorators

# Custom Decorators

## Table of Contents
- [Parameter Decorators](#parameter-decorators)
- [Metadata Decorators](#metadata-decorators)
- [Composed Decorators](#composed-decorators)

## Parameter Decorators

### Current User Decorator
```typescript
// decorators/user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// Usage
@Get('profile')
getProfile(@CurrentUser() user: User) {
  return user;
}

@Get('profile')
getEmail(@CurrentUser('email') email: string) {
  return { email };
}
```

### Request IP Decorator
```typescript
// decorators/ip.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClientIp = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.ip || request.headers['x-forwarded-for']?.split(',')[0];
  },
);
```

### Query Params with Defaults
```typescript
// decorators/pagination.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export const Pagination = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PaginationParams => {
    const request = ctx.switchToHttp().getRequest();
    const page = Math.max(1, parseInt(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(request.query.limit) || 10));
    return { page, limit, skip: (page - 1) * limit };
  },
);

// Usage
@Get()
findAll(@Pagination() { skip, limit }: PaginationParams) {
  return this.service.findAll({ skip, take: limit });
}
```

## Metadata Decorators

### Roles Decorator
```typescript
// decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// Usage
@Roles('admin', 'moderator')
@Post()
create() {}
```

### Public Route Decorator
```typescript
// decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Usage
@Public()
@Get('health')
health() { return 'ok'; }
```

### Custom Response Code
```typescript
// decorators/response-message.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RESPONSE_MESSAGE_KEY = 'responseMessage';
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

// Usage with interceptor
@ResponseMessage('User created successfully')
@Post()
create() {}
```

### Rate Limit Decorator
```typescript
// decorators/rate-limit.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';
export interface RateLimitOptions {
  points: number;
  duration: number;
}

export const RateLimit = (points: number, duration: number) =>
  SetMetadata(RATE_LIMIT_KEY, { points, duration });

// Usage
@RateLimit(10, 60) // 10 requests per 60 seconds
@Get()
findAll() {}
```

## Composed Decorators

### Auth + Roles Combo
```typescript
// decorators/auth.decorator.ts
import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from './roles.decorator';

export const Auth = (...roles: string[]) =>
  applyDecorators(
    Roles(...roles),
    UseGuards(JwtAuthGuard, RolesGuard),
  );

// Usage - combines auth and role check
@Auth('admin')
@Delete(':id')
remove(@Param('id') id: string) {}
```

### API Endpoint Decorator
```typescript
// decorators/api-endpoint.decorator.ts
import { applyDecorators, HttpCode, HttpStatus, Type } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

export const ApiEndpoint = (options: {
  summary: string;
  responseType?: Type<any>;
  status?: HttpStatus;
}) =>
  applyDecorators(
    ApiOperation({ summary: options.summary }),
    ApiResponse({
      status: options.status || HttpStatus.OK,
      type: options.responseType,
    }),
    HttpCode(options.status || HttpStatus.OK),
  );

// Usage
@ApiEndpoint({ summary: 'Get all users', responseType: UserDto })
@Get()
findAll() {}
```

### Validation Decorator
```typescript
// decorators/validated.decorator.ts
import { applyDecorators, UsePipes, ValidationPipe } from '@nestjs/common';

export const Validated = () =>
  applyDecorators(
    UsePipes(new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })),
  );
```

### Serialization Decorator
```typescript
// decorators/serialize.decorator.ts
import { UseInterceptors, ClassSerializerInterceptor, SerializeOptions } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';

export const Serialize = (groups?: string[]) =>
  applyDecorators(
    UseInterceptors(ClassSerializerInterceptor),
    SerializeOptions({ groups }),
  );

// Usage
@Serialize(['admin'])
@Get(':id')
findOne(@Param('id') id: string) {}
```

## Class-Validator Decorators

### Custom Validation Decorator
```typescript
// decorators/is-unique.decorator.ts
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@ValidatorConstraint({ async: true })
@Injectable()
export class IsUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private prisma: PrismaService) {}

  async validate(value: any, args: ValidationArguments) {
    const [model, field] = args.constraints;
    const record = await this.prisma[model].findFirst({
      where: { [field]: value },
    });
    return !record;
  }

  defaultMessage(args: ValidationArguments) {
    const [model, field] = args.constraints;
    return `${field} already exists in ${model}`;
  }
}

export function IsUnique(
  model: string,
  field: string,
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [model, field],
      validator: IsUniqueConstraint,
    });
  };
}

// Usage
export class CreateUserDto {
  @IsUnique('user', 'email', { message: 'Email already registered' })
  @IsEmail()
  email: string;
}
```

### Match Fields Decorator
```typescript
// decorators/match.decorator.ts
import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';

export function Match(property: string, options?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'match',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options,
      validator: {
        validate(value: any, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints;
          const relatedValue = (args.object as any)[relatedPropertyName];
          return value === relatedValue;
        },
        defaultMessage(args: ValidationArguments) {
          return `${propertyName} must match ${args.constraints[0]}`;
        },
      },
    });
  };
}

// Usage
export class ChangePasswordDto {
  @IsString()
  password: string;

  @Match('password', { message: 'Passwords must match' })
  confirmPassword: string;
}
```

-e 
## error-handling

# Error Handling & Exception Filters

## Table of Contents
- [Built-in Exceptions](#built-in-exceptions)
- [Custom Exceptions](#custom-exceptions)
- [Exception Filters](#exception-filters)
- [Error Response Patterns](#error-response-patterns)

## Built-in Exceptions

```typescript
import {
  BadRequestException,      // 400
  UnauthorizedException,    // 401
  ForbiddenException,       // 403
  NotFoundException,        // 404
  MethodNotAllowedException,// 405
  ConflictException,        // 409
  GoneException,            // 410
  PayloadTooLargeException, // 413
  UnprocessableEntityException, // 422
  InternalServerErrorException, // 500
  NotImplementedException,  // 501
  BadGatewayException,      // 502
  ServiceUnavailableException, // 503
} from '@nestjs/common';

// Usage
throw new NotFoundException('User not found');
throw new BadRequestException('Invalid email format');
throw new UnauthorizedException();

// With custom response
throw new BadRequestException({
  statusCode: 400,
  message: 'Validation failed',
  errors: ['email must be valid', 'name is required'],
});
```

## Custom Exceptions

### Domain-Specific Exception
```typescript
// exceptions/domain.exception.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class DomainException extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, message, statusCode: status }, status);
  }
}

// Specific domain exceptions
export class InsufficientFundsException extends DomainException {
  constructor(available: number, required: number) {
    super(
      'INSUFFICIENT_FUNDS',
      `Insufficient funds: ${available} available, ${required} required`,
    );
  }
}

export class ResourceLockedException extends DomainException {
  constructor(resource: string) {
    super('RESOURCE_LOCKED', `${resource} is currently locked`, HttpStatus.CONFLICT);
  }
}

// Usage
throw new InsufficientFundsException(50, 100);
```

### Business Logic Exceptions
```typescript
// exceptions/business.exception.ts
export class UserAlreadyExistsException extends ConflictException {
  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid email or password');
  }
}

export class TokenExpiredException extends UnauthorizedException {
  constructor() {
    super({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
  }
}
```

## Exception Filters

### Global HTTP Exception Filter
```typescript
// filters/http-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    const error = typeof exceptionResponse === 'string'
      ? { message: exceptionResponse }
      : (exceptionResponse as object);

    const body = {
      ...error,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    };

    this.logger.error(
      `${request.method} ${request.url} ${status}`,
      exception.stack,
    );

    response.status(status).json(body);
  }
}
```

### All Exceptions Filter
```typescript
// filters/all-exceptions.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Internal server error';

    this.logger.error(
      `${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
```

### Prisma Exception Filter
```typescript
// filters/prisma-exception.filter.ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Database error';

    switch (exception.code) {
      case 'P2002': // Unique constraint
        status = HttpStatus.CONFLICT;
        const field = (exception.meta?.target as string[])?.join(', ');
        message = `Duplicate value for: ${field}`;
        break;
      case 'P2025': // Record not found
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
        break;
      case 'P2003': // Foreign key constraint
        status = HttpStatus.BAD_REQUEST;
        message = 'Related record not found';
        break;
    }

    response.status(status).json({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}
```

### Validation Exception Filter
```typescript
// filters/validation-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { Response } from 'express';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const exceptionResponse = exception.getResponse() as any;

    response.status(400).json({
      statusCode: 400,
      error: 'Validation Error',
      messages: Array.isArray(exceptionResponse.message)
        ? exceptionResponse.message
        : [exceptionResponse.message],
    });
  }
}
```

## Applying Filters

```typescript
// Global (main.ts)
app.useGlobalFilters(new AllExceptionsFilter());

// Global with DI (module)
@Module({
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}

// Controller level
@UseFilters(HttpExceptionFilter)
@Controller('users')
export class UsersController {}

// Route level
@UseFilters(new ValidationExceptionFilter())
@Post()
create() {}
```

## Error Response Patterns

### Standard Error Response
```typescript
// interfaces/error-response.interface.ts
export interface ErrorResponse {
  statusCode: number;
  message: string;
  error?: string;
  code?: string;
  errors?: ValidationError[];
  timestamp: string;
  path: string;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}
```

### Validation Pipe with Custom Errors
```typescript
// main.ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const messages = errors.map((err) => ({
        field: err.property,
        message: Object.values(err.constraints || {}).join(', '),
        value: err.value,
      }));
      return new BadRequestException({
        statusCode: 400,
        error: 'Validation Error',
        errors: messages,
      });
    },
  }),
);
```

-e 
## guards-interceptors

# Guards & Interceptors

## Table of Contents
- [Guards](#guards)
- [Interceptors](#interceptors)
- [Execution Order](#execution-order)

## Guards

### JWT Authentication Guard
```typescript
// guards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    
    if (!token) {
      throw new UnauthorizedException();
    }
    
    try {
      const payload = await this.jwtService.verifyAsync(token);
      request.user = payload;
    } catch {
      throw new UnauthorizedException();
    }
    
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers['authorization']?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
```

### Role-Based Guard
```typescript
// guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user } = context.switchToHttp().getRequest();
    return requiredRoles.some((role) => user.roles?.includes(role));
  }
}
```

### Public Route Decorator + Guard
```typescript
// decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// guards/jwt-auth.guard.ts - with public route support
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) return true;
    
    // ... rest of auth logic
  }
}
```

### Applying Guards

```typescript
// Global guard (in main.ts or module)
app.useGlobalGuards(new JwtAuthGuard());

// Or via module providers
@Module({
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

// Controller level
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {}

// Route level
@UseGuards(JwtAuthGuard)
@Get('profile')
getProfile() {}

// Public route
@Public()
@Get('health')
health() { return 'ok'; }
```

## Interceptors

### Logging Interceptor
```typescript
// interceptors/logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${method} ${url} - ${Date.now() - now}ms`);
      }),
    );
  }
}
```

### Transform Response Interceptor
```typescript
// interceptors/transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface Response<T> {
  data: T;
  meta: { timestamp: string };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: { timestamp: new Date().toISOString() },
      })),
    );
  }
}
```

### Timeout Interceptor
```typescript
// interceptors/timeout.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException());
        }
        return throwError(() => err);
      }),
    );
  }
}
```

### Cache Interceptor
```typescript
// interceptors/cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, of, tap } from 'rxjs';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private cache = new Map<string, any>();

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const key = context.switchToHttp().getRequest().url;
    
    if (this.cache.has(key)) {
      return of(this.cache.get(key));
    }

    return next.handle().pipe(
      tap((response) => this.cache.set(key, response)),
    );
  }
}
```

### Applying Interceptors

```typescript
// Global
app.useGlobalInterceptors(new LoggingInterceptor());

// Module
@Module({
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}

// Controller
@UseInterceptors(LoggingInterceptor)
@Controller('users')
export class UsersController {}

// Route
@UseInterceptors(CacheInterceptor)
@Get()
findAll() {}
```

## Execution Order

Request lifecycle:
```
Middleware → Guards → Interceptors (pre) → Pipes → Handler → Interceptors (post) → Exception Filters
```

Multiple guards/interceptors execute in registration order:
```typescript
@UseGuards(AuthGuard, RolesGuard) // AuthGuard runs first
@UseInterceptors(LoggingInterceptor, CacheInterceptor) // Logging wraps Cache
```

-e 
## modules-di

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

-e 
## prisma

# Prisma Integration

## Table of Contents
- [Setup](#setup)
- [PrismaService](#prismaservice)
- [Repository Pattern](#repository-pattern)
- [Transactions](#transactions)
- [Soft Deletes](#soft-deletes)

## Setup

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

### Schema Example
```prisma
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## PrismaService

```typescript
// prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

```typescript
// prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

## CRUD Service Pattern

```typescript
// users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateUserDto) {
    return this.prisma.user.create({ data });
  }

  findAll(params?: {
    skip?: number;
    take?: number;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }) {
    return this.prisma.user.findMany(params);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { posts: true },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  update(id: string, data: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
```

## Repository Pattern

For complex domains, abstract Prisma behind a repository:

```typescript
// users/users.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersRepository {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findMany(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.UserWhereUniqueInput;
    where?: Prisma.UserWhereInput;
    orderBy?: Prisma.UserOrderByWithRelationInput;
  }): Promise<User[]> {
    return this.prisma.user.findMany(params);
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  async delete(id: string): Promise<User> {
    return this.prisma.user.delete({ where: { id } });
  }
}
```

## Transactions

### Sequential Operations
```typescript
async transferFunds(fromId: string, toId: string, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    const sender = await tx.account.update({
      where: { id: fromId },
      data: { balance: { decrement: amount } },
    });

    if (sender.balance < 0) {
      throw new Error('Insufficient funds');
    }

    await tx.account.update({
      where: { id: toId },
      data: { balance: { increment: amount } },
    });

    return tx.transfer.create({
      data: { fromId, toId, amount },
    });
  });
}
```

### Batch Operations
```typescript
async createUserWithPosts(userData: CreateUserDto, posts: CreatePostDto[]) {
  return this.prisma.$transaction([
    this.prisma.user.create({ data: userData }),
    ...posts.map((post) => this.prisma.post.create({ data: post })),
  ]);
}
```

### Transaction Options
```typescript
await this.prisma.$transaction(
  async (tx) => {
    // operations
  },
  {
    maxWait: 5000, // max time to wait for transaction slot
    timeout: 10000, // max transaction duration
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  },
);
```

## Soft Deletes

### Schema with Soft Delete
```prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  deletedAt DateTime?
  // ...
}
```

### Prisma Middleware
```typescript
// prisma/prisma.service.ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Soft delete middleware
    this.$use(async (params, next) => {
      if (params.model === 'User') {
        if (params.action === 'delete') {
          params.action = 'update';
          params.args.data = { deletedAt: new Date() };
        }
        if (params.action === 'deleteMany') {
          params.action = 'updateMany';
          params.args.data = { deletedAt: new Date() };
        }
        // Filter out soft-deleted records
        if (['findUnique', 'findFirst', 'findMany'].includes(params.action)) {
          params.args.where = { ...params.args.where, deletedAt: null };
        }
      }
      return next(params);
    });
  }
}
```

## Pagination Helper

```typescript
// common/pagination.ts
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function paginate<T>(
  prisma: any,
  model: string,
  params: PaginationParams,
  where?: any,
): Promise<PaginatedResult<T>> {
  const page = params.page || 1;
  const limit = params.limit || 10;
  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma[model].findMany({ where, skip, take: limit }),
    prisma[model].count({ where }),
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

-e 
## scheduling

# Scheduled Tasks

## Table of Contents
- [Setup](#setup)
- [Cron Jobs](#cron-jobs)
- [Intervals & Timeouts](#intervals--timeouts)
- [Dynamic Scheduling](#dynamic-scheduling)

## Setup

```bash
npm install @nestjs/schedule
```

```typescript
// app.module.ts
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // ...
  ],
})
export class AppModule {}
```

## Cron Jobs

### Basic Cron
```typescript
// tasks/tasks.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  // Run every day at midnight
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  handleDailyCleanup() {
    this.logger.log('Running daily cleanup');
  }

  // Run every hour
  @Cron(CronExpression.EVERY_HOUR)
  handleHourlySync() {
    this.logger.log('Syncing data');
  }

  // Custom cron expression: At 10:30 on weekdays
  @Cron('30 10 * * 1-5')
  handleWeekdayTask() {
    this.logger.log('Weekday task');
  }

  // With timezone
  @Cron('0 9 * * *', { timeZone: 'America/Los_Angeles' })
  handleMorningTask() {
    this.logger.log('Good morning, LA!');
  }
}
```

### Common Cron Expressions

| Expression | Description |
|------------|-------------|
| `EVERY_MINUTE` | Every minute |
| `EVERY_5_MINUTES` | Every 5 minutes |
| `EVERY_HOUR` | Every hour |
| `EVERY_DAY_AT_MIDNIGHT` | Daily at 00:00 |
| `EVERY_DAY_AT_NOON` | Daily at 12:00 |
| `EVERY_WEEK` | Every Sunday at 00:00 |
| `EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT` | Monthly on 1st |
| `MONDAY_TO_FRIDAY_AT_9AM` | Weekdays at 9am |

### Cron Syntax
```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └── Day of week (0-7, 0 and 7 = Sunday)
│ │ │ │ └──── Month (1-12)
│ │ │ └────── Day of month (1-31)
│ │ └──────── Hour (0-23)
│ └────────── Minute (0-59)
└──────────── Second (0-59, optional)
```

## Intervals & Timeouts

### Intervals
```typescript
@Injectable()
export class TasksService {
  // Every 10 seconds
  @Interval(10000)
  handleInterval() {
    this.logger.log('Called every 10 seconds');
  }

  // Named interval (can be stopped)
  @Interval('notifications', 30000)
  handleNotifications() {
    this.logger.log('Checking notifications');
  }
}
```

### Timeouts
```typescript
@Injectable()
export class TasksService {
  // Run once after 5 seconds
  @Timeout(5000)
  handleTimeout() {
    this.logger.log('Called once after 5 seconds');
  }

  // Named timeout
  @Timeout('init', 3000)
  handleDelayedInit() {
    this.logger.log('Delayed initialization');
  }
}
```

## Dynamic Scheduling

### SchedulerRegistry
```typescript
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class DynamicTasksService {
  constructor(private schedulerRegistry: SchedulerRegistry) {}

  // Add cron job dynamically
  addCronJob(name: string, cronTime: string, callback: () => void) {
    const job = new CronJob(cronTime, callback);
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
  }

  // Stop/delete cron job
  deleteCronJob(name: string) {
    this.schedulerRegistry.deleteCronJob(name);
  }

  // Get all cron jobs
  getCronJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, key) => {
      console.log(`Job: ${key}, Next: ${job.nextDate()}`);
    });
  }

  // Add interval
  addInterval(name: string, ms: number, callback: () => void) {
    const interval = setInterval(callback, ms);
    this.schedulerRegistry.addInterval(name, interval);
  }

  // Delete interval
  deleteInterval(name: string) {
    this.schedulerRegistry.deleteInterval(name);
  }

  // Add timeout
  addTimeout(name: string, ms: number, callback: () => void) {
    const timeout = setTimeout(callback, ms);
    this.schedulerRegistry.addTimeout(name, timeout);
  }
}
```

### Usage Example
```typescript
@Controller('tasks')
export class TasksController {
  constructor(private dynamicTasks: DynamicTasksService) {}

  @Post('schedule')
  scheduleTask(@Body() dto: ScheduleTaskDto) {
    this.dynamicTasks.addCronJob(
      dto.name,
      dto.cronExpression,
      () => console.log(`Task ${dto.name} executed`),
    );
    return { message: `Task ${dto.name} scheduled` };
  }

  @Delete('schedule/:name')
  cancelTask(@Param('name') name: string) {
    this.dynamicTasks.deleteCronJob(name);
    return { message: `Task ${name} cancelled` };
  }
}
```

## Task Patterns

### Database Cleanup
```typescript
@Injectable()
export class CleanupService {
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredTokens() {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    this.logger.log(`Deleted ${result.count} expired tokens`);
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldLogs() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
  }
}
```

### External API Sync
```typescript
@Injectable()
export class SyncService {
  private isRunning = false;

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncExternalData() {
    if (this.isRunning) {
      this.logger.warn('Sync already in progress, skipping');
      return;
    }

    this.isRunning = true;
    try {
      const data = await this.fetchExternalData();
      await this.updateLocalDatabase(data);
      this.logger.log(`Synced ${data.length} records`);
    } catch (error) {
      this.logger.error('Sync failed', error.stack);
    } finally {
      this.isRunning = false;
    }
  }
}
```

### Health Check with Notifications
```typescript
@Injectable()
export class HealthCheckService {
  constructor(
    private http: HttpService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkServices() {
    const services = ['api', 'database', 'redis'];
    
    for (const service of services) {
      try {
        await this.checkService(service);
      } catch (error) {
        await this.notifications.sendAlert({
          service,
          status: 'down',
          error: error.message,
        });
      }
    }
  }
}
```

## Testing Scheduled Tasks

```typescript
describe('TasksService', () => {
  let service: TasksService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired tokens', async () => {
      mockPrismaService.refreshToken.deleteMany.mockResolvedValue({ count: 5 });
      
      await service.cleanupExpiredTokens();
      
      expect(mockPrismaService.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
```

-e 
## testing

# Testing Patterns

## Table of Contents
- [Unit Tests](#unit-tests)
- [E2E Tests](#e2e-tests)
- [Test Utilities](#test-utilities)
- [Mocking Strategies](#mocking-strategies)

## Unit Tests

### Service Test
```typescript
// users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a user', async () => {
      const dto = { email: 'test@test.com', name: 'Test' };
      const expected = { id: '1', ...dto };
      mockPrismaService.user.create.mockResolvedValue(expected);

      const result = await service.create(dto);

      expect(prisma.user.create).toHaveBeenCalledWith({ data: dto });
      expect(result).toEqual(expected);
    });
  });

  describe('findOne', () => {
    it('should return a user', async () => {
      const user = { id: '1', email: 'test@test.com' };
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      expect(await service.findOne('1')).toEqual(user);
    });

    it('should throw NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('1')).rejects.toThrow('not found');
    });
  });
});
```

### Controller Test
```typescript
// users/users.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: UsersService;

  const mockUsersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get<UsersService>(UsersService);
  });

  it('should return all users', async () => {
    const users = [{ id: '1', email: 'test@test.com' }];
    mockUsersService.findAll.mockResolvedValue(users);

    expect(await controller.findAll()).toEqual(users);
  });
});
```

### Guard Test
```typescript
// guards/roles.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const mockContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
    }) as unknown as ExecutionContext;

  it('should allow access when no roles required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(mockContext({}))).toBe(true);
  });

  it('should allow access when user has required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext({ roles: ['admin'] }))).toBe(true);
  });

  it('should deny access when user lacks role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext({ roles: ['user'] }))).toBe(false);
  });
});
```

## E2E Tests

### Setup
```typescript
// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    
    prisma = app.get(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    // Clean database before each test
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /users', () => {
    it('should create a user', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ email: 'test@test.com', name: 'Test User' })
        .expect(201)
        .expect((res) => {
          expect(res.body.email).toBe('test@test.com');
          expect(res.body.id).toBeDefined();
        });
    });

    it('should reject invalid email', () => {
      return request(app.getHttpServer())
        .post('/users')
        .send({ email: 'invalid', name: 'Test' })
        .expect(400);
    });
  });

  describe('GET /users/:id', () => {
    it('should return a user', async () => {
      const user = await prisma.user.create({
        data: { email: 'test@test.com', name: 'Test' },
      });

      return request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.email).toBe('test@test.com');
        });
    });

    it('should return 404 for missing user', () => {
      return request(app.getHttpServer())
        .get('/users/nonexistent-id')
        .expect(404);
    });
  });
});
```

### Authenticated E2E Tests
```typescript
describe('Protected Routes (e2e)', () => {
  let app: INestApplication;
  let authToken: string;

  beforeAll(async () => {
    // ... app setup

    // Get auth token
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password' });
    
    authToken = response.body.accessToken;
  });

  it('should access protected route with token', () => {
    return request(app.getHttpServer())
      .get('/users/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  it('should reject without token', () => {
    return request(app.getHttpServer())
      .get('/users/profile')
      .expect(401);
  });
});
```

## Test Utilities

### Test Database Setup
```typescript
// test/setup.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  for (const { tablename } of tables) {
    if (tablename !== '_prisma_migrations') {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
    }
  }
}
```

### Factory Pattern
```typescript
// test/factories/user.factory.ts
import { PrismaService } from '../../src/prisma/prisma.service';

export class UserFactory {
  constructor(private prisma: PrismaService) {}

  async create(overrides: Partial<{ email: string; name: string }> = {}) {
    return this.prisma.user.create({
      data: {
        email: overrides.email ?? `test-${Date.now()}@test.com`,
        name: overrides.name ?? 'Test User',
      },
    });
  }

  async createMany(count: number) {
    return Promise.all(Array.from({ length: count }, () => this.create()));
  }
}
```

## Mocking Strategies

### Mock Module
```typescript
// test/mocks/prisma.mock.ts
export const mockPrismaService = {
  user: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  post: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockPrismaService)),
};
```

### Auto-mock with jest.mock
```typescript
jest.mock('../prisma/prisma.service');

import { PrismaService } from '../prisma/prisma.service';
const MockedPrisma = PrismaService as jest.MockedClass<typeof PrismaService>;
```

### Partial Mocks
```typescript
const module: TestingModule = await Test.createTestingModule({
  providers: [
    UsersService,
    {
      provide: PrismaService,
      useValue: {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: '1', email: 'test@test.com' }),
          // Other methods use real implementation or throw
        },
      },
    },
  ],
}).compile();
```

## Jest Configuration

```javascript
// jest.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};

// jest-e2e.config.js
module.exports = {
  ...require('./jest.config'),
  rootDir: '.',
  testRegex: '.e2e-spec.ts$',
};
```

