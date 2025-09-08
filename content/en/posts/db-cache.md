---
title: "DB-Cache Consistency Problem"
date: 2025-09-02T10:00:00+08:00
categories: ["Technology", "Backend"]
tags: ["Data Consistency", "DB", "Cache"]
---

How to ensure the consistency between cache and database is a topic that has been discussed over and over again.

But many people still have a lot of doubts about this issue:

  * Should the cache be updated or deleted? 
  * Should I choose to update the database first and then delete the cache, or to delete the cache first and then update the database? 
  * Why introduce message queues to ensure consistency? 
  * What problems may arise from delaying double deletion? Should we use it or not? 
  * ...

## Introducing cache improves performance

Let's start with the simplest scenario.

If your business is in its infancy and the traffic is very small, then whether it is a read request or a write request, you can directly operate the database. At this time, your architecture model is like this:

{{< lightbox src="/images/db-cache/img-1.png" width="1200px" >}}

However, as your business volume grows, the number of project requests becomes increasingly large. If you read data from the database every time at this point, there will definitely be performance issues.

At this stage, the common practice is to introduce "caching" to enhance read performance, and the architectural model becomes like this:

{{< lightbox src="/images/db-cache/img-2.png" width="1200px" >}}

Among the current outstanding cache middleware, Redis stands out. It not only has extremely high performance but also offers many friendly data types, which can well meet our business needs.

But after introducing cache, you will face a problem: **Previously, the data only existed in the database, but now it needs to be read in the cache. How exactly should it be stored?**

The simplest and most direct solution is to "flush all the data into the cache" :

- The data in the database is fully flushed into the cache (without setting the expiration time)
- Write requests only update the database, not the cache
- Start a scheduled task to update the database data to the cache at regular intervals

{{< lightbox src="/images/db-cache/img-3.png" width="1200px" >}}

The advantage of this solution is that all read requests can directly "hit" the cache without the need to check the database, resulting in extremely high performance.

However, the drawbacks are also quite obvious. There are two problems:

1. **Low cache utilization** : Data that is not frequently accessed remains in the cache
2. **Data Inconsistency** : Since the cache is refreshed "at regular intervals", there is an inconsistency between the cache and the database (depending on the execution frequency of the scheduled tasks).

Therefore, this solution is generally more suitable for business scenarios where the business volume is small and the requirements for data consistency are not high.

Then, if our business volume is large, how can we solve these two problems?

### Cache utilization and consistency issues

Let's first look at the first question: How to improve cache utilization?

To maximize cache utilization, the solution that comes to mind easily is to retain only the most recently accessed "hot data" in the cache. But how exactly should it be done?

We can optimize it in this way:
- The write request still only writes to the database
- A read request first reads the cache. If the cache does not exist, it reads from the database and rebuilds the cache
- At the same time, the expiration time is set for all the data written into the cache

{{< lightbox src="/images/db-cache/img-4.png" width="1200px" >}}

In this way, the data that is not frequently accessed in the cache will gradually "expire" and be eliminated over time. Eventually, what is retained in the cache are all frequently accessed "hot data", and the utilization rate of the cache is maximized.

Let's take a look at the issue of data consistency again.

To ensure that the cache and the database are "real-time" consistent, it is no longer possible to use scheduled tasks to refresh the cache.

So, when data is updated, we not only have to operate on the database but also on the cache at the same time. The specific operation is that when modifying a piece of data, not only the database but also the cache should be updated together.

However, both the database and the cache are updated, and there is a sequence issue. Therefore, there are two corresponding solutions:

1. Update the cache first, then the database
2. Update the database first, then the cache

Which plan is better?

For now, let's not consider the issue of concurrency. Under normal circumstances, no matter which comes first or second, we can keep the two consistent. But now, we need to focus on the "abnormal" situation.

Since the operation is divided into two steps, it is very likely that there will be a situation where "the first step succeeds and the second step fails".

Let's analyze these two plans one by one.

**1) Update the cache first, then the database**

If the cache update is successful but the database update fails, then at this time, the latest value is in the cache, but the "old value" is in the database.

Although the read request can hit the cache at this time and obtain the correct value, once the cache "expires", the "old value" will be read from the database, and the cache reconstruction will also be based on this old value.

At this point, users will find that the data they previously modified has "reverted", which will have an impact on their business.

**2) Update the database first, then update the cache**

If the database update is successful but the cache update fails, then at this time, the latest value is in the database and the "old value" is in the cache.

All subsequent read requests read old data. Only when the cache "expires" can the correct value be obtained from the database.

At this point, users will find that they have just modified the data but cannot see the changes. It will take some time for the data to be updated, which will also have an impact on the business.

It can be seen that no matter who comes first or later, whenever the latter experiences an anomaly, it will have an impact on the business. So how can this problem be solved?

Don't worry. I will provide the corresponding solutions in detail later.

Let's continue our analysis. Besides the issue of operation failure, what other scenarios could affect data consistency?

Here we also need to pay close attention to: **Concurrency issues**.

### Consistency issues caused by concurrency

Suppose we adopt the solution of "updating the database first and then the cache", and both steps can be "successfully executed", what would the situation be like if there is concurrency?

If there are two threads, Thread A and Thread B, and they need to update "the same piece of data", the following scenario will occur:

1. Thread A updates the database (X = 1)
2. Thread B updates the database (X = 2)
3. Thread B updates the cache (X = 2
4. Thread A updates the cache (X = 1

The final value of X is 1 in the cache and 2 in the database, resulting in an inconsistency.
That is to say, although A occurred before B, the time B spent operating on the database and cache was shorter than that of A, causing a "disorder" in the execution sequence. Ultimately, this data result did not meet expectations.

> Similarly, adopting the approach of "updating the cache first and then the database" will also lead to similar issues, which will not be elaborated here.

So how can this problem be solved? The common solution here is to add a "distributed lock".

Two threads need to modify "the same piece of data". Before each thread makes the change, it first applies for a distributed lock. Only the thread that obtains the lock is allowed to update the database and cache. The thread that fails to obtain the lock returns a failure and waits for the next retry.

The purpose of doing this is to allow only one thread to operate on data and cache, avoiding concurrent issues.

In addition, when evaluating this solution from the perspective of "cache utilization", it is also not very recommended.

This is because every time the data changes, the cache is updated "mindlessly", but the data in the cache may not be "read immediately", which may lead to a lot of infrequently accessed data being stored in the cache, wasting cache resources.

Moreover, in many cases, the values written to the cache do not correspond one-to-one with those in the database. It is very likely that the database is queried first, and then a value is obtained through a series of "calculations" before being written to the cache.

It can be seen from this that this solution of "updating the database + updating the cache" not only has a low cache utilization rate but also leads to a waste of machine performance.

So at this point, we need to consider another solution: **Delete the cache**.

## Can deleting the cache ensure consistency?

There are also two corresponding solutions for deleting the cache:

1. First, delete the cache, and then update the database
2. Update the database first and then delete the cache

Similarly, let's first look at the situation where the "second step" operation fails.

First, delete the cache, then update the database. If the second operation fails and the database is not updated successfully, the next time you read the cache and find it does not exist, read from the database and rebuild the cache. At this point, the database and the cache remain consistent.

However, if the database is updated first and then the cache is deleted, the second operation fails. The database shows the latest value, while the cache contains the old value, resulting in an inconsistency. So, this plan still has problems.

In conclusion, similar to the issues mentioned earlier, there is still a risk of inconsistency if the second step fails.

Ok, let's take a look at the "concurrency" issue again. This is the "key point" we need to focus on.

### Delete the cache first, and then update the database

If two threads need to concurrently "read and write" data, the following scenarios may occur:

1. Thread A needs to update X = 2 (original value X = 1)
2. Thread A deletes the cache first
3. Thread B reads the cache and finds it does not exist. It then reads the old value (X = 1) from the database.
4. Thread A writes the new value to the database (X = 2)
5. Thread B writes the old value to the cache (X = 1).

The final value of X is 1 (the old value) in the cache and 2 (the new value) in the database, resulting in an inconsistency.

It can be seen that when the cache is deleted first and then the database is updated, there are still cases of data inconsistency when "read + write" concurrency occurs.

### Update the database first and then delete the cache

It is still two threads concurrently "reading and writing" data:

1. X does not exist in the cache (database X = 1)
2. Thread A reads the database and obtains the old value (X = 1)
3. Thread B updates the database (X = 2)
4. Thread B deletes the cache 
5. Thread A writes the old value to the cache (X = 1)

Ultimately, the value of X is 1 (the old value) in the cache and 2 (the new value) in the database, and inconsistencies also occur.

This situation is theoretically possible, but is it really possible in reality?

In fact, the probability is "very low", because it must meet three conditions:

1. The cache has just expired
2. Concurrent read requests and write requests 
3. The time required to update the database and delete the cache (steps 3-4) is shorter than that for reading the database and writing to the cache (Steps 2 and 5).

On second thought, the probability of condition 3 occurring is actually very low.

Because writing to a database usually involves "locking" first, it typically takes longer to write to a database than to read it.

From this perspective, the solution of "updating the database first and then deleting the cache" can ensure data consistency.

Therefore, we should adopt this solution to operate the database and cache.

Ok, having resolved the concurrency issue, let's move on to the problem left over from earlier, **which was the "failed" execution in the second step, resulting in data inconsistency**.

## How to ensure that both steps are executed successfully?

As we analyzed earlier, whether it is updating the cache or deleting the cache, if the second step fails, it will lead to inconsistency between the database and the cache.

**Ensuring the successful execution of the second step is the key to solving the problem**.

Think about it. If an exception occurs during the execution of a program, what is the simplest solution?

The answer is: **Retry**.

Yes, actually we can do it this way here as well.

Whether we operate on the cache first or the database first, if the latter fails to execute, we can initiate a retry and try our best to make "compensation".

Does this mean that as long as the execution fails, we can just "mindlessly retry"?

The answer is no. The reality is often not as simple as we think. The problem with retrying immediately after failure lies in:

- There is a high probability that an immediate retry will "still fail"
- How many times should the "retry count" be set reasonably? 
- Retries will constantly "occupy" this thread's resources and be unable to serve requests from other clients

See? Although we want to solve the problem by retrying, this "synchronous" retry solution is still not rigorous.

Then what should be the better plan?

The answer is: **Asynchronous retry**. What is asynchronous retry?

In fact, it is to write the retry request to the "message queue", and then have a dedicated consumer retry it until it is successful.

Or, to avoid the failure of the second step, we can place the cache operation step directly into the message queue and let the consumer operate the cache.

At this point, you might ask, could writing a message queue also fail? Moreover, introducing a message queue adds even more maintenance costs. Is it worth it to do so?

This is a good question. But let's consider this: If you keep retrying in a thread that failed to execute and haven't achieved success yet, and the project "restarts" at this point, then this retry request will be "lost", and this piece of data will remain inconsistent.

So, here we must place the retry message or the second-step operation in another "service", and this service is most suitable to be called a "message queue". This is because the characteristics of the message queue precisely meet our requirements:

- **Message queue ensures reliability** : Messages written to the queue will not be lost before successful consumption (there is no need to worry even if the project is restarted)
- **Message queue ensures successful message delivery** : The downstream pulls messages from the queue. Messages will only be deleted after successful consumption; otherwise, messages will continue to be delivered to consumers (meeting our retry requirements).

As for the issues of queue writing failure and the maintenance cost of message queues:

- **Failed to write to the queue** : The probability of "simultaneous failure" when operating the cache and writing to the message queue is actually very small
- **Maintenance cost** : Message queues are generally used in our projects, and the maintenance cost has not increased significantly

So, introducing a message queue to solve this problem is quite appropriate. At this point, the architectural model becomes like this:

{{< lightbox src="/images/db-cache/img-5.png" width="1200px" >}}

Then, if you really don't want to write a message queue in the application, is there a simpler solution that can still ensure consistency?

There are still solutions. This is a relatively popular solution in recent years: **subscribe to the database change log and then operate the cache**.

Specifically, when our business application modifies data, it "only needs" to modify the database without operating the cache.

Then when should the cache be operated? This is related to the "change log" of the database.

Take MySQL as an example. When a piece of data is modified, MySQL will generate a change log (Binlog). We can subscribe to this log to obtain the specific operation data, and then delete the corresponding cache based on this data.

{{< lightbox src="/images/db-cache/img-6.png" width="1200px" >}}

Subscribe to change logs. Currently, there are also relatively mature open-source middleware available, such as Alibaba's canal. The advantages of using this solution lie in:

- **There is no need to consider the failure of writing to the message queue**: As long as writing to MySQL is successful, there will definitely be Binlog

- **Automatically delivered to the downstream queue**: canal automatically delivers the database change logs to the downstream message queues

Of course, at the same time, we need to invest energy in maintaining the high availability and stability of canal.

> If you have paid attention to observing the characteristics of many databases, you will find that many databases are gradually beginning to offer the function of "subscribing to change logs". I believe that in the near future, we will no longer need to pull logs through middleware. 
> We can subscribe to change logs by writing our own programs, which can further simplify the process.

At this point, we can draw the conclusion that to ensure the consistency of the database and cache, **it is recommended to adopt the solution of "updating the database first and then deleting the cache", and combine it with the methods of "message queue" or "subscribing to change logs"**.

## The issue of master-slave database delay and delayed double deletion

At this point, there are still two issues that we have not focused on analyzing.

**First question**, do you still remember the scenario mentioned earlier where "delete the cache first and then update the database" led to inconsistency?

Here I'll bring you another example for you to review

When two threads need to concurrently "read and write" data, the following scenarios may occur:

1. Thread A needs to update X = 2 (original value X = 1)
2. Thread A deletes the cache first 
3. Thread B reads the cache and finds it does not exist. It then reads the old value (X = 1) from the database. 
4. Thread A writes the new value to the database (X = 2)
5. Thread B writes the old value to the cache (X = 1).

The final value of X is 1 (the old value) in the cache and 2 (the new value) in the database, resulting in an inconsistency.

**The second question**, It is about the consistency of cache and database in the case of "read-write separation + master-slave replication delay".

If the "update the database first, then delete the cache" solution is used, inconsistencies actually occur as well:

1. Thread A updates the main library X = 2 (original value X = 1)
2. Thread A deletes the cache
3. Thread B queries the cache but misses. It then queries the "slave library" to obtain the old value (the slave library X = 1).
4. The slave libraries are "synchronized" to complete (master and slave libraries X = 2)
5. Thread B writes the "old value" to the cache (X = 1).

Ultimately, the value of X is 1 (the old value) in the cache and 2 (the new value) in the master-slave database, and inconsistencies also occur.

See? The core of these two issues lies in the fact that both caches have been replanted with "old values".

So how can such problems be solved?

The most effective way is to **delete the cache**.

However, immediate deletion is not possible; instead, "delayed deletion" is required. This is the solution provided by the industry: **Cache delay dual deletion strategy**.

According to the delayed double deletion strategy, the solutions to these two problems are as follows:

**Solve the first problem** : After thread A deletes the cache and updates the database, it first "sleeps for a while" and then "deletes" the cache once again.

**Solve the second problem** : Thread A can generate a "delayed message" and write it to the message queue, with the consumer delaying the "deletion" of the cache.

The purpose of both of these solutions is to clear the cache. In this way, the latest value can be read from the database and written into the cache next time.

But here comes the question: How long exactly should the delay time be set for this "deferred deletion" cache?

- Question 1: The delay time is greater than the time it takes for thread B to read from the database and write to the cache
- Question 2: The delay time is greater than that of "master-slave replication"

However, **in distributed and high-concurrency scenarios, it is actually very difficult to assess this time.**

Often, we roughly estimate this delay time based on experience, for instance, a delay of 1 to 5 seconds, which can only minimize the probability of inconsistency as much as possible.

So you see, adopting this solution is merely to ensure consistency as much as possible. In extreme cases, inconsistencies may still occur.

So in actual use, I still suggest you adopt the solution of "updating the database first and then deleting the cache", and at the same time, try your best to ensure that the "master-slave replication" does not have too much delay to reduce the probability of problems.

## Can strong consistency be achieved?

At this point, you might be thinking that these solutions are still not perfect. I just want to make the cache and the database "strongly consistent". Can it really be achieved?

In fact, it's very difficult.

To achieve strong consistency, the most common solutions are consistency protocols such as 2PC, 3PC, Paxos, and Raft. However, their performance is often poor, and these solutions are also rather complex, with various fault tolerance issues to be considered.

On the contrary, at this point, let's think from another perspective: What is the purpose of introducing cache?

Yes, **performance**.

Once we decide to use caching, we are bound to face consistency issues. Performance and consistency are like the two ends of a balance; it's impossible to meet both requirements.

Moreover, taking the solution we mentioned earlier as an example, before the operation on the database and cache is completed, as long as there are other requests that can come in, it is possible to find the data of the "intermediate state".

So if strong consistency is to be pursued, it must be required that no "requests" come in during the period before all update operations are completed.

Although we can achieve this by adding a "distributed lock", we will also have to pay a corresponding price, and it is very likely that the performance improvement brought by introducing a cache will exceed that.

So, since we have decided to use caching, we must tolerate the "consistency" issue. We can only try our best to reduce the probability of the problem occurring.

At the same time, we should also be aware that all caches have an "expiration time". Even if there are short-term inconsistencies during this period, we still have an expiration time as a fallback, which can still achieve ultimate consistency.