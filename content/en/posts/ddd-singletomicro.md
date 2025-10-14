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

Here, the focus is on `rpc` under `infra`.

#### rpc
As mentioned earlier, it functions as infrastructure providing RPC communication capabilities. Each module must offer its own services, so it necessarily includes a `server.go` file—or potentially a `server` package.

Its role is protocol conversion, constructing request objects, and then passing requests through to the `application` layer. For gRPC, it also provides additional capabilities like metadata handling. This logic can reside within the server layer
or be extracted separately. The optimal approach is to use gRPC interceptors for unified extraction, allowing subsequent retrieval directly from the context (ctx).

Additionally, since it requires cross-service invocations, it must include clients for other modules, necessitating a `client.go` file.

Analyzing this, the structure becomes clear:
- `rpc/server`: Protocol conversion, request construction, encapsulating the application
- `rpc/client`: Constructs the gRPC client (connection, serialization, load balancing, interceptors, etc.), without encapsulating business logic

This approach decouples the communication mechanism (infrastructure) from the business logic, ensuring each component focuses on its core responsibilities with clear delineation of duties.

It should be noted that in microservices, a `crossdomain` layer is not designed. The reason is that the purpose of crossdomain is to decouple two modules through interface contracts, allowing A to no longer directly depend on B, but instead decouple via interfaces.
However, in microservices, each module's interfaces are exposed as interfaces, such as gRPC Clients, so this layer is largely unnecessary.