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
