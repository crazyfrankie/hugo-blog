---
title: "Cache and DB - Consistency Tradeoffs"
date: 2025-09-11T10:00:00+08:00
categories: ["Technology", "Backend"]
tags: ["Caching", "System design", "Architecture design"]
---

Today we talk about bypass caching strategies.

## Introduction to Concepts

Generally speaking we introduce caching in our business, which involves three ways of manipulating the database and caching:
- Read-through:
    1. application reads data.
    2. it checks Redis. a hit is returned.
    3. If there is no hit, check MySQL.
    4. Fetch the data from MySQL and write it to Redis.
    5. Return the data.
- Write through:
    1. The application updates the data.
    2. Code executes simultaneously (or in the same transaction):
       - Update the MySQL database.
       - Update (or invalidate) the corresponding cache in Redis.
- Bypass the cache:
    - Read operations: Use the "read-through" policy.
        - Cache Hit -> return cached data.
        - Cache Miss -> Read from DB, backfill Cache and return.
    - Write operation: first update DB, then delete (invalidate) cache.
        - This is the essence of the "bypass cache" strategy - "update the database first, then delete the cache".

For read-through from the above introduction can also be seen that it is not used alone, and write-through, there is no middleware support for simultaneous operation of the database, so generally do not use, so the most daily use of the third way: bypass caching!

## Bypass caching

Specifically why the introduction of bypass cache, you can go to see another article [DB-Cache consistency issues](https://www.crazyfrank.top/en/posts/db-cache-consistency-problem/).

This article focuses on optimization ideas for the classic bypass caching strategy.

### What if the second step fails?
Once again, we come up with the problem discussed in DB-Cache Consistency.

When exploring various write strategies, the article follows the premise that ``writing the database and manipulating the cache`` are all in the same thread, so in order to solve the concurrency problem brought about by the traditional **writing the database first and then writing the cache**, it leads to **deleting the cache** instead of **updating the cache**.
So we introduced **delete cache** instead of **update cache**, and then went on to discuss what to do if the second step fails. In that article, we introduced a way to asynchronize deletion of the cache using a message queue, which ensures the reliability of the operation

Then this way is actually `write database, operation cache` decoupled, the former synchronous, the latter asynchronous, this design can already achieve strong consistency, but the throughput is still not extreme, the reason is that our write DB is still synchronous.

Is there another way?

Yes, let's look at another design

### Writing DBs is also asynchronous

Take a comment system for example.
{{< lightbox src="/images/cache-aside/img-1.png" width="800px" >}}

Let's just look at the write operation. In this design, whenever there is a write request, the `comment service` writes a message to kafka, which is consumed asynchronously by the `comment-job`, and in the process, it writes to the database and then updates the cache.

Why doesn't it **delete the cache** instead of **update the cache**? Thinking back, why did we introduce **Delete Cache** at that time? Was it to solve the concurrency problem?

The kafka in this architecture, on the other hand, has a partition that naturally supports sequential consumption. What does this mean?

Specifically, when multiple requests operate on the same piece of data, all of them are sent to kafka, and the same piece of data can be sent to the same partition through kafka's hash policy, which is synchronized IO, meaning that their operations are atomic, one by one.
That is to say, their operations are atomic, one by one, so there is a natural guarantee that there will be no concurrency problems.

It's the fact that it's `writing the database and manipulating the cache` in the same thread, combined with kafka's sequential consumption, that ensures that concurrency issues don't arise.

#### Compare and contrast the way the two write operations are designed

1. Data consistency
    - Scenario A:
        - The DB is updated synchronously, so as long as the DB succeeds, the data will not be lost.
        - Cache is deleted asynchronously, there may be short-lived old data, but the next read request will trigger back to the source and eventually be consistent.
        - Suitable for: Scenarios with high requirements for strong DB data consistency (e.g. orders, payments).
    - Scenario B:
        - Both DB and cache are updated asynchronously, and both may be transiently inconsistent in the event of a Kafka message backlog or consumption failure.
        - Ideal for: scenarios that allow for eventual consistency (e.g., social comments, dynamics).
2. Performance and Throughput
    - Scenario A:
        - The service layer still needs to write DB synchronously and DB is still the bottleneck.
        - However, caching operations are asynchronized to alleviate some of the pressure.
    - Scenario B:
        - Option B: All asynchronous, the service layer only needs to write Kafka, throughput is very high.
        - It is suitable for highly concurrent writing scenarios (such as microblog comments and chat messages).
3. Caching strategy differences
    - Scenario A (Delete Cache):
        - Advantage: Avoid cache pollution, ensure that the next read request back to the source of the latest data.
        - Disadvantage: May cause a cache hit (a large number of requests back to the source DB at the same time).
    - Scenario B (directly update the cache): Advantage: the cache always has data:
        - Option B (Update the cache directly): Advantage: The cache always has data, reducing the pressure on the source DB.
        - Disadvantage: If Kafka consumption is delayed, the cache may hold old data for a short time.


| Scenarios                                                                       | Recommended Scenarios                                         | Reasons                                                           |
|---------------------------------------------------------------------------------|---------------------------------------------------------------|-------------------------------------------------------------------|
| Read more, write less, strong consistency requirements (e.g., orders, accounts) | Scenario A (synchronous write DB + asynchronous delete cache) | Ensure DB strong consistency, cache eventually consistent         |
| Write more read less, high throughput (e.g., comments, dynamics)                | Scenario B (fully asynchronous Kafka write DB + cache)        | Maximize write performance, allow for short-lived inconsistencies |
| Ultra-high concurrency, acceptable latency (e.g., hotlisting)                   | Scenario B + local cache                                      | Further reduce DB stress                                          |


### Can read operations be asynchronized?

According to the classic Cache-Aside pattern, reading back to the source (Loading Data on Cache Miss) must be synchronous.

It seeks to complete data fetching within the lifecycle of a single request, ensuring that this request returns the most accurate data possible.

Why is synchronized readback required?

The purpose is to solve the consistency problem. Synchronized back to the source can ensure:
1. Consistency of the data returned by this request: when a cache miss occurs, the client needs to wait for that synchronization operation to complete to ensure that it is getting the most recent data in the current database (assuming that no other concurrent write operations interfere). If the return is asynchronous, the request will either fail to return data or return a null or error, which is generally unacceptable. 2.
2. Avoiding "return storms": A key technique for synchronizing returns is the use of Mutex Locks. When multiple concurrent requests find out that the same key cache is invalid, only one request gets the lock to query the database and back to the source cache synchronously, while the others wait for the lock to be released and then read directly from the newly populated cache. This avoids multiple requests trying to hit the database at the same time.

But with the design in the diagram you can actually see that our return to source is also **asynchronous**.

Asynchronous back-origin via Kafka is an optimization and compromise to the classic pattern. It solves some of the pain points of the classic pattern, but it also introduces new features.

#### What does solve?
- **Reduced read request latency**: the server doesn't have to wait for the cache write to complete. As long as the data is checked from the database, it can be returned to the client immediately, and the cache update is handed over to the background for asynchronous processing, which significantly improves the interface response speed.
- **Simplified server-side logic**: the server does not need to deal with complex cache write logic and locking mechanism, the code is more concise.
- **Merge Write**: Multiple updates to the same data can be merged in the asynchronous message queue to reduce the pressure of writing to the cache.

#### What was introduced? (consistency issues)
- **Transient data inconsistency**: old data (or no data) remains in the cache until an asynchronous message is processed. Subsequent read requests will read the old data until the cache is invalidated.
- **Possible data loss**: If a Kafka message is lost or consumption fails, the cache remains in an unreturned state until the next write operation triggers an update or the cache naturally expires.

However, this design is a **reasonable tradeoff**, for commenting systems, users see their own or others' comments updated a few milliseconds or seconds late, which is usually an acceptable business scenario.
Trading this small price for a significant increase in system throughput and responsiveness is a very worthwhile architectural decision.