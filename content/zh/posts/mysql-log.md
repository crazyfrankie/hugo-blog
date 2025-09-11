---
title: "MVCC 及 MySQL 日志"
date: 2025-09-02T10:00:00+08:00
draft: false
categories: ["技术", "后端"]
tags: ["MySQL"]
---

在 **MVCC** 机制下，**Redo Log 和 Bin Log 主要在事务提交时发挥作用** ，它们的作用和触发时机如下：

---

### 事务执行过程中的日志行为

当执行：
```sql
UPDATE users SET age = 26 WHERE id = 1;  
```    

MySQL 的 **事务执行顺序** （结合 MVCC + 日志）如下：

#### (1) 生成 Undo Log（历史版本）

  * **MVCC 机制** ： 
    * 事务修改 `age` 字段时，不直接覆盖，而是**将旧值写入 Undo Log** （用于回滚和快照读）。
    * 假设 `age` 原来是 `25`，Undo Log 记录： `{ trx_id: 1001, row_id: 1, old_value: 25 }`
    * **在 Buffer Pool 中修改 age = 26** ，但其他事务可能仍然看到 `25`（基于 Undo Log）。

#### (2) 写入 Redo Log（保证崩溃恢复）

  - **MySQL 不直接将数据写入磁盘，而是先记录 Redo Log（WAL 机制）** ： 
    - Redo Log 记录物理层面的修改： yaml复制编辑`{ page_id: 123, offset: 56, new_value: 26, state: PREPARE }`
    - **数据页的修改还未刷盘** ，但 Redo Log 已写入 **WAL（Write-Ahead Logging）** ，保证即使崩溃也能恢复。

#### (3) 事务提交时，写入 Bin Log（用于主从复制和备份）

  - **事务提交后** ：
    - **先写 Bin Log（逻辑日志）** ，记录 SQL 语句： sql复制编辑`UPDATE users SET age = 26 WHERE id = 1;`
    - **再提交 Redo Log（将 “PREPARE” 状态改为 “COMMIT”）** 。
    - **数据最终刷新到磁盘（Checkpoint 机制）** ，MySQL 才真正持久化数据。

---

### Bin Log、Redo Log、Undo Log 在整个事务过程中的作用

| **日志类型**     | **记录内容**         | **作用**               | **触发时机**        |
|--------------|------------------|----------------------|-----------------|
| **Undo Log** | **旧数据的历史版本**     | **回滚事务 / MVCC 版本控制** | 事务修改数据时         |
| **Redo Log** | **物理数据页的修改**     | **崩溃恢复（保证已提交事务不丢失）** | 事务执行过程中（WAL 机制） |
| **Bin Log**  | **SQL 语句（逻辑日志）** | **主从复制、数据恢复**        | 事务提交时           |

---

### 事务提交顺序：为什么需要两阶段提交（2PC）？

**为了解决 Redo Log 和 Bin Log 可能不一致的问题，MySQL 采用两阶段提交** ：

  1. **Prepare 阶段** ： 
     - **先写 Redo Log，状态是 “PREPARE”** （保证崩溃后仍可恢复）。
     - **再写 Bin Log** （确保 SQL 语句不会丢失）。
  2. **Commit 阶段** ： 
     - **标记 Redo Log 为 “COMMIT”，确保数据最终提交** 。

这样即使 MySQL 在 **Redo Log 和 Bin Log 之间崩溃** ：

  - **如果 Bin Log 已写入但 Redo Log 还没提交** ，则重启时继续提交事务，保证数据一致性。
  - **如果 Redo Log 还未写入 “PREPARE” 状态** ，事务直接回滚，防止未提交数据影响数据库。

---

### 总结

**整个事务的日志流转过程：**

  1. **事务开始修改数据** → **生成 Undo Log** （保证回滚能力）。
  2. **事务执行时** → **写入 Redo Log（保证崩溃恢复）** 。
  3. **事务提交时** ： 
     - **先写 Redo Log（标记 “PREPARE” 状态）** 。
     - **再写 Bin Log（记录 SQL 语句）** 。
     - **提交 Redo Log（标记 “COMMIT”），最终落盘** 。

这样 **Undo Log 负责回滚，Redo Log 负责崩溃恢复，Bin Log 负责主从复制和备份** ，三者各司其职，共同保证 MySQL
的事务安全和高效性。

