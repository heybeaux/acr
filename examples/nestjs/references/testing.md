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
