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
