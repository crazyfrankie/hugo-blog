---
title: "Logs and Errors"
date: 2025-09-03T10:00:00+08:00
draft: false
categories: ["Technology", "Backend"]
tags: ["System Design", "Log"]
---

## Logs and Errors

Generally speaking, in our project, if we strictly divide it according to a hierarchical structure, it is roughly `handler`, `service` (which is further subdivided into `application` in DDD), and
`domain`, `dao`.

For the `dao` layer, if an error occurs, we deal with it by directly up-throwing and selectively logging the error, for example, 
there may be some interfaces that involve parameter validation at the `dao` layer, manually managing transactions, and so on, which require logging, but the error is still directly up-throwing.

In the `service` layer, when we encounter errors, they are categorized into two situations: errors within business expectations, and non-business errors.

For the former, we deal with it by predefining various business error codes, converting them to error interface up-throw when encountered, 
and converting them to resp code by handler to be returned to the client, with optional `Warn` logs (low-frequency critical scenarios).

For the latter, the error is usually a technical error, which should not be handled by the `service` itself, but by the caller, so here we play logging + error up-throw. 
The description here is also not exhaustive, you can refer to the following table for details:

| **Scene classification**                                   | **Processing Method**                              | **Log Policy**                                          | **Whether to throw upwards or not** | **Examples**                                        |
|------------------------------------------------------------|----------------------------------------------------|---------------------------------------------------------|-------------------------------------|-----------------------------------------------------|
| 1. Expected business errors                                | Return custom business error types                 | Optional Warn log (low-frequency critical scenarios) is | Yes                                 | `ErrUserNotFound`                                   |
| 2. Non-critical errors that need to be downgraded          | Silent processing, return default values           | No logging                                              | No                                  | Downgrade and check DB when cache expires           |            
| 3. Infrastructure/Technical errors                         | Wrap the original Error, add business context      | Mandatory error log                                     | Yes                                 | Database connection failed, RPC timeout             |           
| 4. The original error that needs to be transmitted through | Directly return the original error without logging | Without Logging                                         | Yes                                 | It is the `gorm.ErrRecordNotFound` of the DAO layer |

What needs to be done at the `handler` layer is relatively simple. If an error is encountered, it is handled through the unified wrap function: through `error.As` to determine whether it is a specific business error. 
If so, retrieve the error code and error message. If not, return a uniform error code and error message. 

At the same time, there are two options here: return the unified error message + the description information in err; 
print the error message only returns a uniform error message. Personally, I prefer the latter. The former is more suitable for Debug environments.