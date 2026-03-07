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
