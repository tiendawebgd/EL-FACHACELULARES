# Security Specification — EL FACHA CELULARES

## 1. Data Invariants
1. **Strict Ownership Isolation**: Every document in `/users/{uid}` and its subcollections (`products`, `repairs`, `sales`) belongs strictly to `uid == request.auth.uid`, and requires a verified email (`request.auth.token.email_verified == true`).
2. **Parent Existence (Master Gate)**: Subcollection documents (`products`, `repairs`, `sales`) can only be created or updated if the parent `/users/{uid}` document exists (or is created atomically in the same batch via `existsAfter`).
3. **Immutable Identity & Creation Timestamps**: `uid` and `createdAt` cannot be modified after creation. `createdAt` must equal `request.time` on create; `updatedAt` must equal `request.time` on create and update.
4. **Strict Key & Size Enforcement**: No ghost/shadow fields allowed (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update). Every string and list enforces explicit upper bounds.
5. **Path ID Hardening**: All path variables (`uid`, `productId`, `repairId`, `saleId`) must match `^[a-zA-Z0-9_-]+$` and be <= 128 chars.
6. **Query Enforcement on List**: Every `allow list` checks `resource.data.uid == request.auth.uid` without performing `get()`/`exists()` lookups.

## 2. "Dirty Dozen" Adversarial Payloads (Must All Be Denied)
1. **Unauthenticated Read**: `GET /users/userA/products/p1` with `auth == null` -> `PERMISSION_DENIED`.
2. **Unverified Email Write**: `CREATE /users/userA` with `auth.uid == 'userA'`, `email_verified: false` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Read**: `GET /users/userA/sales/s1` authenticated as `userB` -> `PERMISSION_DENIED`.
4. **Cross-Tenant List**: `LIST /users/userA/products` authenticated as `userB` -> `PERMISSION_DENIED`.
5. **Identity Spoofing on Create**: `CREATE /users/userA/products/p1` as `userA` with `uid: 'userB'` -> `PERMISSION_DENIED`.
6. **Shadow / Ghost Field Injection**: `CREATE /users/userA/products/p1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
7. **Update-Gap Value Poisoning**: `UPDATE /users/userA/products/p1` setting `stock: -5` or `nombre: <1MB string>` -> `PERMISSION_DENIED`.
8. **Immutable Field Tampering**: `UPDATE /users/userA/repairs/r1` modifying `uid` or `createdAt` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: `CREATE /users/userA/sales/s1` with `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Path ID Poisoning**: `CREATE /users/userA/products/bad$id..1500chars` -> `PERMISSION_DENIED`.
11. **Unbounded Array Exhaustion**: `CREATE /users/userA/sales/s1` with `items` length = 150 (> 100) or non-map element `items: ["bad"]` -> `PERMISSION_DENIED`.
12. **Invalid Enum State**: `CREATE /users/userA/repairs/r1` with `estado: "Hacked"` -> `PERMISSION_DENIED`.
