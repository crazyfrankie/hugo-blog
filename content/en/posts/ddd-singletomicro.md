---
title: "DDD--Migrating from Monolith to Microservices"
date: 2025-09-16T10:00:00+08:00
draft: false
categories: ["Backend", "Technology"]
tags: ["DDD", "Architecture Design"]
---

DDD stands for Domain-Driven Design, born to enhance development efficiency in internet companies. Specifically, it employs a specialized description language to ensure PMs and RDs describe the same matter without one side favoring users and the other favoring technology.

Technically, it provides a series of concepts to guide us in applying this design within systems.

We'll illustrate using the open-source version of coze's code, then explore how to migrate it to microservices.

For detailed DDD concepts, refer to [this resource](https://domain-driven-design.org/zh/ddd-concept-reference.html).

## Monolithic DDD

In [My Thoughts on DDD](https://www.crazyfrank.top/zh/posts/ddd-的一些思考), I discussed project organization, focusing solely on `crossdomain`. Here, we'll explore the other components:

```bash.

├── api
├── application
├── conf
├── crossdomain
├── domain
├── infra
├── internal
├── main.go
├── pkg
└── types
```

1. `api`: HTTP interface handling
2. `application`: Application layer services handle business orchestration and data object transformation. They avoid specific business logic, relying on domain services to solve problems.
3. `domain`: Domain layer services manage business logic and data permissions within their scope. They ignore scenarios and business rules, focusing solely on data.
4. `infra`: Infrastructure layer provides external resource adaptation (databases, message queues, RPC, HTTP, caching, etc.).

Let's illustrate this with a concrete scenario: `User Login`.

When using websites, we often need to log in. You may notice many sites now support multiple login methods: Google, Github, phone number, email, Apple, etc.

So, how would we implement such a login interface from API to infrastructure?

### Login Interface Scenario
The `api` package is straightforward—it provides an HTTP interface for frontend calls. The `application` layer likely offers multiple methods to support different login methods, focusing on business orchestration and data transformation.
It simply constructs the specific data required by each login method within each interface. The `domain` layer handles operations on the `User` model: queries and creations.
The `infra` layer encapsulates various login methods: Google Auth, SMS services, email services, etc., while also providing database and cache operations to support `domain` data management.

## How to Migrate?
Assuming we migrate to microservices using gRPC or other protocols instead of HTTP-RPC.

Based on my initial approach to microservices, I would directly remove the `api` layer and add an `rpc` layer.

Because in a monolith:
- Handler (API) sits at the outermost layer (REST/HTTP entry point).
- Application orchestrates business cases.
- Domain layer implements core business logic.
- Infra layer provides database, caching, and other implementations (called by upper layers).

So I instinctively thought:

RPC is like another "handler" and should be abstracted above services since it exposes services externally.

But this approach is fundamentally flawed. From a DDD perspective, RPC is essentially a communication mechanism, not business semantics.

- Application's responsibility: Define and expose business use cases (e.g., UserApplicationService.CreateUser(cmd)).
- Infra's responsibility: Handle technical implementation, adapting various protocols (DB, MQ, RPC, HTTP) to the business layer.

Thus, an RPC Server can only be considered an Adapter. Let's illustrate this with a concrete module example.

### Module Division in Microservices
```
.
└── user-service
    ├── application
    │   └── user.go
    ├── conf
    ├── crossdomain
    │       ├── contract
    │       │    ├── app
    │       │    └── event
    │       └── impl
    │            ├── app
    │            └── event
    ├── domain
    │     └── user
    │          ├── entity
    │          ├── repository
    │          └── service
    ├── infra
    │     ├── contract
    │     │    ├── event
    │     │    └── rpc
    │     └── impl
    │          ├── event
    │          └── rpc
    ├── internal
    ├── main.go
    └── pkg
```

Here, focus on two modules under `infra`: `rpc` and `crossdomain`.

#### rpc, crossdomain
As mentioned earlier, it serves as infrastructure providing RPC communication capabilities. Each module requires its own service, hence the inclusion of `server.go` (or possibly a `server` package).

Its role is protocol conversion, constructing request objects, and passing requests transparently to `application`. For gRPC, it also provides additional capabilities like metadata handling. This logic can reside at the server layer
or be extracted separately. The optimal approach is using gRPC interceptors to uniformly extract metadata, allowing subsequent retrieval from the context (ctx).

Additionally, it requires cross-service invocations, necessitating clients from other modules. This also requires including client.go.

What about `crossdomain`? As mentioned earlier, in monolithic architectures, crossdomain acts as a protective layer, encapsulating cross-module invocations. In monoliths, these are direct in-process calls, while microservices require RPC.
As previously noted, cross-service invocations are implemented by rpc/client.go.

Analyzing this, the roles become clear:
- `rpc/server`: Protocol conversion, request construction, encapsulates the application
- `rpc/client`: Constructs the gRPC client (connection, serialization, load balancing, interceptors, etc.), does not encapsulate business logic
- `crossdomain`: Defines and implements ACLs, relies on `infra/rpc client`, handles semantic/protocol conversion, and passes results to the application or domain

This approach decouples communication mechanisms (infrastructure) from business logic, ensuring each component focuses on its core responsibilities with clear delineation of duties.