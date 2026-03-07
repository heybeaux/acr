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
