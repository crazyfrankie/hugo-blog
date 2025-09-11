---
title: "MVCC and MySQL Logs"
date: 2025-09-02T10:00:00+08:00
draft: false
categories: ["Technology", "Backend"]
tags: ["MySQL"]
---

Under the **MVCC** mechanism, **Redo Log and Bin Log are mainly useful at transaction commit time** and their roles and trigger timing are as follows:

---

### Logging behavior during transaction execution

When executing:
```sql
UPDATE users SET age = 26 WHERE id = 1;
```

MySQL's **transaction execution order** (combined with MVCC + logging) is as follows:

#### (1) Generate Undo Log (historical version)

* **MVCC mechanism**:
    * When a transaction modifies the `age` field, instead of overwriting it directly, it ** writes the old value to the Undo Log** (for rollback and snapshot reads).
    * Assuming that `age` was originally `25`, the Undo Log would record: `{ trx_id: 1001, row_id: 1, old_value: 25 }`.
    * **Change age = 26** in the Buffer Pool, but other transactions may still see `25` (based on Undo Log).

#### (2) Write to Redo Log (guaranteed crash recovery)

- **MySQL does not write data directly to disk, but records Redo Log first (WAL mechanism)**:
    - Redo Log logs changes at the physical level: yaml copy edit `{ page_id: 123, offset: 56, new_value: 26, state: PREPARE }`
    - **Modifications to the data page have not been flushed** but the Redo Log has been written to **WAL (Write-Ahead Logging)** to ensure that it can be recovered even if it crashes.

#### (3) Write to Bin Log when transaction commits (for master-slave replication and backup)

- **After transaction commit** :
    - **First write Bin Log (Logic Logging)** to record the SQL statement: sql copy edit `UPDATE users SET age = 26 WHERE id = 1;`
    - **Then submit Redo Log (change "PREPARE" status to "COMMIT")** .
    - **The data is finally flushed to disk (Checkpoint mechanism)** before MySQL actually persists the data.

---

### Role of Bin Log, Redo Log, and Undo Log in the overall transaction process

| **Type of Log** | **Content of Log**                      | **Role**                                                                | **Timing of Trigger**                        |
|-----------------|-----------------------------------------|-------------------------------------------------------------------------|----------------------------------------------|
| **Undo Log**    | **Historical version of old data**      | **Rollback transaction / MVCC version control**                         | When transaction modifies data               |
| **Redo Log**    | **Modification of Physical Data Pages** | **Crash Recovery (to ensure that committed transactions are not lost)** | During Transaction Execution (WAL Mechanism) |
| **Bin Log**     | **SQL Statements (Logic Log)**          | **Master-Slave Replication, Data Recovery**                             | During transaction commit                    |

---

### Transaction commit order: why is a two-phase commit (2PC) needed?

**To solve the problem that the Redo Log and Bin Log may not be consistent, MySQL uses a two-phase commit**:

1. **Prepare phase**:
    - **Write Redo Log first, with status "PREPARE "** (guaranteed to be recoverable after a crash).
    - **Then write Bin Log** (to make sure that SQL statements are not lost).
2. **Commit phase**:
    - **Mark the Redo Log as "COMMIT" to ensure that the data is finally committed** .

This way even if MySQL crashes between **Redo Log and Bin Log**:

- **If the Bin Log has been written but the Redo Log has not been committed**, the transaction continues to commit on restart to ensure data consistency.
- **If the Redo Log has not been written to the "PREPARE" status**, the transaction is rolled back to prevent uncommitted data from affecting the database.

---

### Summary

**The flow of logs throughout the transaction:**

1. **Transaction starts to modify data** → **Generate Undo Log** (guarantees rollback capability).
2. **When the transaction executes** → **Write Redo Log (guarantees crash recovery)**.
3. **When transaction commits** :
    - **Write Redo Log (mark "PREPARE" status)**.
    - **Then write Bin Log (logging SQL statement)** .
    - **Commit Redo Log (mark "COMMIT") and finally drop the disk** .

In this way **Undo Log is responsible for rollback, Redo Log is responsible for crash recovery, and Bin Log is responsible for master-slave replication and backup** , and each of the three has its own role to play in ensuring MySQL
transaction security and efficiency of MySQL.