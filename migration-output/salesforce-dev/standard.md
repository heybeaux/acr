---
name: salesforce-dev
description: Salesforce development patterns for Apex, Lightning Web Components (LWC), SOQL/SOSL, testing, and deployments. Use when building Salesforce apps, triggers, batch jobs, LWC components, writing test classes, or deploying with sfdx/sf CLI. Covers AppExchange partner development patterns.
---

# Salesforce Development

Development patterns for Salesforce platform targeting AppExchange ISV/partner standards.

## Quick Reference

| Topic | Reference |
|-------|-----------|
| Apex patterns (triggers, batch, queueable, callouts) | [references/apex-patterns.md](references/apex-patterns.md) |
| LWC patterns (components, wire, events) | [references/lwc-patterns.md](references/lwc-patterns.md) |

## Governor Limits (Critical)

Always design with these in mind:
- **100 SOQL queries** per transaction
- **150 DML statements** per transaction
- **50,000 records** retrieved per SOQL
- **10,000 records** per DML
- **6MB heap** (12MB async)
- **10s CPU time** (60s async)
- **100 callouts** per transaction

## SOQL/SOSL Patterns

```apex
// Bulkified query - use bind variables
List<Account> accts = [SELECT Id, Name FROM Account WHERE Id IN :accountIds];

// Aggregate query
AggregateResult[] results = [SELECT AccountId, COUNT(Id) cnt FROM Contact GROUP BY AccountId];

// Relationship query (parent-to-child)
List<Account> accts = [SELECT Id, (SELECT Id, LastName FROM Contacts) FROM Account];

// Child-to-parent
List<Contact> contacts = [SELECT Id, Account.Name FROM Contact];

// SOSL - full text search
List<List<SObject>> results = [FIND 'Acme*' IN ALL FIELDS RETURNING Account(Id, Name), Contact(Id, Name)];

// Dynamic SOQL (use sparingly, escape user input)
String query = 'SELECT Id FROM Account WHERE Name = :searchName';
List<Account> results = Database.query(query);
```

## Testing Requirements

AppExchange requires **75% code coverage** minimum (aim for 85%+).

```apex
@isTest
private class AccountServiceTest {
    
    @TestSetup
    static void setup() {
        // Create test data once, available to all test methods
        Account acc = new Account(Name = 'Test Account');
        insert acc;
    }
    
    @isTest
    static void testPositiveCase() {
        Account acc = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        AccountService.processAccount(acc.Id);
        Test.stopTest();
        
        // Assert results
        acc = [SELECT Status__c FROM Account WHERE Id = :acc.Id];
        System.assertEquals('Processed', acc.Status__c, 'Status should be Processed');
    }
    
    @isTest
    static void testBulk() {
        // Test with 200+ records for bulk scenarios
        List<Account> accounts = TestDataFactory.createAccounts(200);
        insert accounts;
        
        Test.startTest();
        AccountService.processAccounts(accounts);
        Test.stopTest();
        
        System.assertEquals(200, [SELECT COUNT() FROM Account WHERE Status__c = 'Processed']);
    }
}
```

### Test Data Factory Pattern

```apex
@isTest
public class TestDataFactory {
    
    public static List<Account> createAccounts(Integer count) {
        List<Account> accounts = new List<Account>();
        for (Integer i = 0; i < count; i++) {
            accounts.add(new Account(Name = 'Test Account ' + i));
        }
        return accounts;
    }
    
    public static List<Contact> createContactsForAccount(Id accountId, Integer count) {
        List<Contact> contacts = new List<Contact>();
        for (Integer i = 0; i < count; i++) {
            contacts.add(new Contact(
                FirstName = 'Test',
                LastName = 'Contact ' + i,
                AccountId = accountId
            ));
        }
        return contacts;
    }
}
```

### HTTP Callout Mock

```apex
@isTest
global class MockHttpResponse implements HttpCalloutMock {
    global HTTPResponse respond(HTTPRequest req) {
        HttpResponse res = new HttpResponse();
        res.setHeader('Content-Type', 'application/json');
        res.setBody('{"status": "success"}');
        res.setStatusCode(200);
        return res;
    }
}

// In test method:
Test.setMock(HttpCalloutMock.class, new MockHttpResponse());
```

## Deployment (sf CLI)

```bash
# Authenticate to org
sf org login web --alias myorg

# Deploy metadata
sf project deploy start --source-dir force-app --target-org myorg

# Deploy with tests
sf project deploy start --source-dir force-app --target-org myorg --test-level RunLocalTests

# Retrieve metadata
sf project retrieve start --metadata ApexClass --target-org myorg

# Run tests
sf apex run test --target-org myorg --test-level RunLocalTests --wait 10

# Create scratch org
sf org create scratch --definition-file config/project-scratch-def.json --alias scratch1 --duration-days 7
```

### Package Development (ISV)

```bash
# Create managed package version
sf package version create --package "My Package" --installation-key mykey --wait 10

# List package versions
sf package version list --packages "My Package"

# Promote to released
sf package version promote --package "My Package@1.0.0-1"
```

## REST Callouts

```apex
public class ExternalApiService {
    
    private static final String ENDPOINT = 'callout:My_Named_Credential/api/v1';
    
    public static Map<String, Object> getData(String recordId) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT + '/records/' + recordId);
        req.setMethod('GET');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(30000);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        } else {
            throw new CalloutException('API Error: ' + res.getStatusCode());
        }
    }
    
    // For callouts from triggers, use @future or Queueable
    @future(callout=true)
    public static void sendDataAsync(String jsonPayload) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(ENDPOINT + '/records');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody(jsonPayload);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        // Handle response
    }
}
```

## Platform Events

```apex
// Publishing events
List<Order_Event__e> events = new List<Order_Event__e>();
events.add(new Order_Event__e(
    Order_Id__c = orderId,
    Action__c = 'Created'
));
EventBus.publish(events);

// Subscribing (Apex trigger on platform event)
trigger OrderEventTrigger on Order_Event__e (after insert) {
    for (Order_Event__e event : Trigger.new) {
        // Process event
        // Use Trigger.operationType to check insert
    }
}

// Set replay ID for recovery
EventBus.setReplayId(eventBus, replayId);
```

## Project Structure

```
force-app/
├── main/
│   └── default/
│       ├── classes/
│       │   ├── services/         # Business logic
│       │   ├── selectors/        # SOQL queries
│       │   ├── domains/          # Domain layer
│       │   ├── triggers/         # Trigger handlers
│       │   └── tests/            # Test classes
│       ├── lwc/                  # Lightning Web Components
│       ├── triggers/             # Trigger definitions
│       ├── objects/              # Custom objects
│       └── permissionsets/       # Permission sets
├── sfdx-project.json
└── config/
    └── project-scratch-def.json
```
