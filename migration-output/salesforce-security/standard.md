---
name: salesforce-security
description: Expert Salesforce AppExchange Security Review auditor. Use for auditing Apex/LWC/Visualforce code before AppExchange submission, fixing security vulnerabilities, understanding CRUD/FLS enforcement, sharing model compliance, secrets storage, SOQL injection prevention, XSS mitigation, and clickjacking protection. Applies when reviewing Salesforce managed packages, preparing for security review, or fixing rejection feedback.
---

# Salesforce AppExchange Security Expert

Audit Salesforce packages for AppExchange Security Review compliance. The security review tests how well your solution protects customer data against hackers, malware, and other threats.

## Quick Reference: Top Rejection Reasons

From Salesforce's official "Top 20 Vulnerabilities" list:

1. **CRUD/FLS Violations** - #1 reason for failure (by significant margin)
2. **Sharing Model Violations** - Missing `with sharing` declarations
3. **SOQL Injection** - Dynamic queries without bind variables
4. **Stored/Reflected XSS** - Unescaped user input in UI
5. **Insecure Secret Storage** - Hardcoded credentials or improper storage
6. **Outdated Dependencies** - Third-party libraries with known CVEs
7. **Clickjacking Vulnerabilities** - CSS position:absolute/fixed in LWCs
8. **Missing Test Coverage** - Below 75% code coverage

## Pre-Submission Checklist

```
□ Run Salesforce Code Analyzer (required for submission)
  sf scanner run --engine pmd-appexchange --target ./force-app
  sf scanner run --target ./force-app --format csv --outfile CodeAnalyzerGeneral.csv

□ All CRUD/FLS enforced (USER_MODE, stripInaccessible, or Schema checks)
□ All classes have explicit sharing declaration (with sharing preferred)
□ No hardcoded credentials or secrets
□ No dynamic SOQL without bind variables
□ No position:absolute/fixed in exposed LWC CSS
□ All third-party libraries up to date (run retire.js)
□ Test coverage ≥75% (aim for 80%+)
□ No escape="false" in Visualforce without encoding
□ Named Credentials for all external callouts
```

---

## 1. CRUD/FLS Enforcement

**Apex runs in system mode by default** - it bypasses object/field permissions. You MUST explicitly enforce CRUD/FLS.

### Modern Approach: USER_MODE (Preferred)

```apex
// ✅ GOOD: USER_MODE enforces CRUD/FLS automatically
List<Account> accounts = [
    SELECT Id, Name, AnnualRevenue
    FROM Account
    WHERE Name LIKE :searchTerm
    WITH USER_MODE
];

// ✅ GOOD: USER_MODE for DML
Database.insert(accounts, AccessLevel.USER_MODE);
Database.update(accounts, AccessLevel.USER_MODE);
Database.delete(accounts, AccessLevel.USER_MODE);
```

### Alternative: Security.stripInaccessible()

```apex
// ✅ GOOD: Strip inaccessible fields before DML
List<Account> accounts = [SELECT Id, Name, AnnualRevenue FROM Account];
SObjectAccessDecision decision = Security.stripInaccessible(
    AccessType.READABLE,
    accounts
);
List<Account> sanitized = decision.getRecords();

// For DML operations:
SObjectAccessDecision decision = Security.stripInaccessible(
    AccessType.CREATABLE,  // or UPDATABLE
    recordsToInsert
);
insert decision.getRecords();
```

### Alternative: WITH SECURITY_ENFORCED

```apex
// ✅ GOOD: Throws exception if user lacks access
List<Account> accounts = [
    SELECT Id, Name, (SELECT LastName FROM Contacts)
    FROM Account
    WHERE Name LIKE 'Acme%'
    WITH SECURITY_ENFORCED
];
```

### Legacy: Schema Describe Checks

```apex
// ✅ GOOD: Manual checks (verbose but explicit)
if (Schema.SObjectType.Account.isAccessible() &&
    Schema.SObjectType.Account.fields.Name.isAccessible() &&
    Schema.SObjectType.Account.fields.AnnualRevenue.isAccessible()) {
    return [SELECT Id, Name, AnnualRevenue FROM Account];
} else {
    throw new AuraHandledException('Insufficient access');
}

// For DML:
if (Schema.SObjectType.Account.isCreateable() &&
    Schema.SObjectType.Account.fields.Name.isCreateable()) {
    insert newAccount;
}
```

### ❌ BAD Patterns

```apex
// ❌ BAD: No CRUD/FLS enforcement
List<Account> accounts = [SELECT Id, Name FROM Account];

// ❌ BAD: with sharing does NOT enforce CRUD/FLS
public with sharing class MyController {
    public List<Account> getAccounts() {
        return [SELECT Id, Name FROM Account]; // Still no FLS!
    }
}
```

### CRUD/FLS Decision Matrix

| Operation | Recommended Method | Alternative |
|-----------|-------------------|-------------|
| Query | `WITH USER_MODE` | `WITH SECURITY_ENFORCED` |
| Insert | `Database.insert(recs, AccessLevel.USER_MODE)` | `stripInaccessible(CREATABLE)` |
| Update | `Database.update(recs, AccessLevel.USER_MODE)` | `stripInaccessible(UPDATABLE)` |
| Delete | `Database.delete(recs, AccessLevel.USER_MODE)` | `isDeletable()` check |

---

## 2. Sharing Model Enforcement

**Critical:** `with sharing` enforces record-level visibility. It does NOT enforce CRUD/FLS.

### Sharing Keywords

```apex
// ✅ GOOD: Enforces sharing rules (PREFERRED for LWC controllers)
public with sharing class AccountController {
    @AuraEnabled(cacheable=true)
    public static List<Account> getAccounts() {
        return [SELECT Id, Name FROM Account WITH USER_MODE];
    }
}

// ⚠️ USE SPARINGLY: Bypasses sharing (requires justification)
public without sharing class AdminService {
    // Only for system operations that require elevated access
}

// ✅ GOOD: Inherits calling context (safe default for utility classes)
public inherited sharing class UtilityHelper {
    // Runs with sharing if caller uses with sharing
    // Runs without sharing only if caller explicitly uses without sharing
}
```

### Sharing Rules

| Keyword | Sharing Enforced | Use Case |
|---------|------------------|----------|
| `with sharing` | Yes | LWC/Aura controllers, user-facing code |
| `without sharing` | No | System operations, background jobs (justify!) |
| `inherited sharing` | Depends on caller | Utility/helper classes |
| (omitted) | Defaults to without | **AVOID - Always declare explicitly** |

### ❌ BAD Patterns

```apex
// ❌ BAD: No sharing declaration (defaults to without sharing)
public class AccountController {
    // User can see ALL accounts regardless of sharing rules!
}

// ❌ BAD: Triggers cannot have sharing keywords
// Triggers always run without sharing - use helper classes
trigger AccountTrigger on Account (before insert) {
    AccountTriggerHandler.handleBeforeInsert(Trigger.new);
}

// ✅ FIX: Handler with explicit sharing
public with sharing class AccountTriggerHandler {
    public static void handleBeforeInsert(List<Account> accounts) {
        // Sharing enforced here
    }
}
```

---

## 3. SOQL Injection Prevention

**Rule:** Never concatenate user input into SOQL. Always use bind variables.

### ✅ GOOD: Bind Variables

```apex
// ✅ GOOD: Static query with bind variable
String searchTerm = userInput;
List<Account> results = [
    SELECT Id, Name FROM Account
    WHERE Name = :searchTerm
    WITH USER_MODE
];

// ✅ GOOD: Dynamic SOQL with bind variable
String query = 'SELECT Id, Name FROM Account WHERE Name = :searchTerm';
List<Account> results = Database.query(query);

// ✅ GOOD: LIKE with bind variable
String searchPattern = '%' + String.escapeSingleQuotes(userInput) + '%';
List<Account> results = [
    SELECT Id, Name FROM Account
    WHERE Name LIKE :searchPattern
    WITH USER_MODE
];
```

### ❌ BAD: String Concatenation

```apex
// ❌ BAD: Direct concatenation = SOQL injection
String query = 'SELECT Id FROM Account WHERE Name = \'' + userInput + '\'';
List<Account> results = Database.query(query);
// Attack: userInput = "' OR Name != '"

// ❌ BAD: Even with escapeSingleQuotes, avoid concatenation
String query = 'SELECT Id FROM Account WHERE Name = \'' +
    String.escapeSingleQuotes(userInput) + '\'';
```

### Dynamic Field/Object Names

```apex
// ✅ GOOD: Validate against schema
public static List<SObject> queryDynamic(String objectName, String fieldName) {
    // Validate object exists
    Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectName);
    if (objType == null) {
        throw new AuraHandledException('Invalid object');
    }

    // Validate field exists
    Map<String, Schema.SObjectField> fields = objType.getDescribe().fields.getMap();
    if (!fields.containsKey(fieldName.toLowerCase())) {
        throw new AuraHandledException('Invalid field');
    }

    // Safe to query
    String query = 'SELECT Id, ' + String.escapeSingleQuotes(fieldName) +
        ' FROM ' + String.escapeSingleQuotes(objectName) + ' WITH USER_MODE';
    return Database.query(query);
}
```

---

## 4. Secure Secrets Storage

**Never hardcode credentials, API keys, or tokens in code.**

### Storage Options (Ranked by Security)

| Method | Security Level | Use Case |
|--------|---------------|----------|
| Named Credentials + External Credentials | ★★★★★ | API callouts with auth |
| Protected Custom Metadata (managed pkg) | ★★★★☆ | Package-internal secrets |
| Protected Custom Settings (managed pkg) | ★★★★☆ | Package-internal secrets |
| Encrypted Custom Fields | ★★★☆☆ | User-specific secrets |
| Named Credentials (legacy) | ★★★☆☆ | Simple auth scenarios |

### ✅ GOOD: Named Credentials

```apex
// ✅ GOOD: Named Credential handles auth automatically
HttpRequest req = new HttpRequest();
req.setEndpoint('callout:MyExternalService/api/endpoint');
req.setMethod('GET');
// Auth header automatically added from Named Credential config
Http http = new Http();
HttpResponse res = http.send(req);
```

### ✅ GOOD: Protected Custom Metadata (Managed Package)

```apex
// In managed package, mark CMT as Protected
// Values are hidden from subscriber orgs
API_Config__mdt config = API_Config__mdt.getInstance('Production');
String apiKey = config.API_Key__c;

// Create HttpRequest with retrieved secret
HttpRequest req = new HttpRequest();
req.setHeader('Authorization', 'Bearer ' + apiKey);
```

### ❌ BAD Patterns

```apex
// ❌ BAD: Hardcoded credentials
private static final String API_KEY = 'sk-abc123secret';

// ❌ BAD: Secrets in code comments
// API Key: sk-abc123secret (for production)

// ❌ BAD: Debug logging secrets
System.debug('API Key: ' + apiKey);

// ❌ BAD: Unprotected Custom Settings (visible in Setup)
MySettings__c settings = MySettings__c.getOrgDefaults();
String password = settings.Password__c; // Visible to admins!
```

---

## 5. XSS Prevention

### Lightning Web Components (LWC)

LWC auto-escapes by default. Vulnerabilities come from unsafe patterns:

```javascript
// ✅ GOOD: Template binding auto-escapes
// template.html
<p>{userInput}</p>

// ❌ BAD: lwc:dom="manual" with innerHTML
// component.js
this.template.querySelector('div').innerHTML = userInput;

// ✅ FIX: Use textContent or sanitize
this.template.querySelector('div').textContent = userInput;
```

### Visualforce

```html
<!-- ✅ GOOD: Standard components auto-escape -->
<apex:outputText value="{!userInput}" />
<apex:inputField value="{!Account.Name}" />

<!-- ❌ BAD: escape="false" without encoding -->
<apex:outputText value="{!userInput}" escape="false" />

<!-- ✅ FIX: Use encoding functions -->
<apex:outputText value="{!HTMLENCODE(userInput)}" escape="false" />

<!-- JavaScript context -->
<script>
    // ❌ BAD: Unencoded in JS
    var name = '{!Account.Name}';

    // ✅ GOOD: JSENCODE for JS context
    var name = '{!JSENCODE(Account.Name)}';
</script>

<!-- URL context -->
<a href="/page?id={!URLENCODE(recordId)}">Link</a>
```

### Encoding Function Reference

| Context | Function | Example |
|---------|----------|---------|
| HTML body | `HTMLENCODE()` | `<p>{!HTMLENCODE(input)}</p>` |
| JavaScript | `JSENCODE()` | `var x = '{!JSENCODE(input)}';` |
| JS in HTML attr | `JSINHTMLENCODE()` | `onclick="fn('{!JSINHTMLENCODE(input)}')"` |
| URL parameter | `URLENCODE()` | `href="?q={!URLENCODE(input)}"` |

---

## 6. Clickjacking Prevention

### LWC CSS Restrictions

Exposed LWC components cannot use CSS that enables UI redressing:

```css
/* ❌ BAD: These will fail security review */
.my-component {
    position: absolute;
    position: fixed;
}

/* ❌ BAD: Even in static resources */
.overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

/* ✅ GOOD: Use relative positioning */
.my-component {
    position: relative;
}

/* ✅ GOOD: Use flexbox/grid for layout */
.container {
    display: flex;
    justify-content: center;
}
```

### Visualforce Clickjack Protection

```html
<!-- Enable in Session Settings, not code -->
<!-- Setup > Session Settings > Clickjack Protection -->
```

---

## 7. Code Analyzer Commands

### Required Scans for Submission

```bash
# Install Code Analyzer
sf plugins install @salesforce/sfdx-scanner

# PMD AppExchange ruleset (required)
sf scanner run --engine pmd-appexchange \
    --target ./force-app \
    --format csv \
    --outfile CodeAnalyzerPmdAppExchange.csv

# General scan
sf scanner run \
    --target ./force-app \
    --format csv \
    --outfile CodeAnalyzerGeneral.csv

# Graph engine for data flow analysis (CRUD/FLS paths)
sf scanner run --engine sfge \
    --target ./force-app \
    --projectdir . \
    --format csv \
    --outfile CodeAnalyzerSfge.csv
```

### Common Violations to Fix

| Rule | Issue | Fix |
|------|-------|-----|
| `ApexCRUDViolation` | No CRUD check | Add `WITH USER_MODE` or `stripInaccessible` |
| `ApexSharingViolations` | Missing sharing keyword | Add `with sharing` |
| `ApexSOQLInjection` | Dynamic SOQL | Use bind variables |
| `ApexXSSFromURLParam` | URL param in output | Encode with `HTMLENCODE` |
| `ApexInsecureEndpoint` | HTTP instead of HTTPS | Change to `https://` |

---

## 8. Test Coverage Requirements

- **Minimum:** 75% overall code coverage
- **Recommended:** 80%+ with meaningful assertions
- **Required:** All triggers must have some coverage

### Testing Security Features

```apex
@IsTest
private class AccountControllerTest {

    @IsTest
    static void testCRUDEnforcement() {
        // Create user without Account access
        User limitedUser = TestDataFactory.createLimitedUser();

        System.runAs(limitedUser) {
            try {
                List<Account> accounts = AccountController.getAccounts();
                System.assert(false, 'Should have thrown exception');
            } catch (AuraHandledException e) {
                System.assert(e.getMessage().contains('access'),
                    'Should mention access denial');
            }
        }
    }

    @IsTest
    static void testSharingEnforcement() {
        Account privateAccount = new Account(Name = 'Private');
        insert privateAccount;

        User otherUser = TestDataFactory.createStandardUser();

        System.runAs(otherUser) {
            List<Account> visible = AccountController.getAccounts();
            System.assertEquals(0, visible.size(),
                'Should not see private records');
        }
    }
}
```

---

## 9. Common Fixes for Rejection Feedback

### "CRUD/FLS not enforced"

```apex
// Before (rejected)
@AuraEnabled
public static List<Account> getAccounts() {
    return [SELECT Id, Name, AnnualRevenue FROM Account];
}

// After (fixed)
@AuraEnabled(cacheable=true)
public static List<Account> getAccounts() {
    return [SELECT Id, Name, AnnualRevenue FROM Account WITH USER_MODE];
}
```

### "Sharing violation in async code"

```apex
// Before (rejected) - Queueable without sharing
public class MyQueueable implements Queueable {
    public void execute(QueueableContext ctx) {
        // Runs without sharing by default!
    }
}

// After (fixed)
public with sharing class MyQueueable implements Queueable {
    public void execute(QueueableContext ctx) {
        // Now respects sharing
    }
}
```

### "Insecure external endpoint"

```apex
// Before (rejected)
req.setEndpoint('http://api.example.com/data');

// After (fixed) - Use Named Credential
req.setEndpoint('callout:MySecureAPI/data');
```

### "Stored XSS in LWC"

```javascript
// Before (rejected)
renderedCallback() {
    this.template.querySelector('.content').innerHTML = this.userContent;
}

// After (fixed)
renderedCallback() {
    this.template.querySelector('.content').textContent = this.userContent;
}
// Or use lightning-formatted-rich-text for safe HTML rendering
```

---

## Audit Workflow

1. **Run Code Analyzer** - Fix all critical/high violations
2. **Search codebase** for anti-patterns:
   - `Database.query` without bind variables
   - Missing `with sharing` declarations
   - `escape="false"` without encoding
   - `position: absolute` or `position: fixed`
   - Hardcoded URLs, keys, passwords
3. **Review all @AuraEnabled methods** for CRUD/FLS
4. **Check all DML operations** for permission enforcement
5. **Verify external callouts** use Named Credentials
6. **Run test suite** - ensure 75%+ coverage
7. **Update third-party libraries** - run retire.js
