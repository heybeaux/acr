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
