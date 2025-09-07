---
title: "Some Thoughts on DDD"
date: 2025-09-04T10:00:00+08:00
draft: false
categories: ["Technology", "Backend"]
tags: ["DDD", "System Design"]
---

## Project Introduction

I'm writing this article mainly to share some learning insights from the project practice of DDD. Since I'm too lazy to read the theory, I'm just guessing how DDD should be designed. For more details, please refer to the DDD official website: [DDD Concept Introduction](https://domain-driven-design.org/zh/ddd-concept-reference.html)

Recently, ByteDance has open-sourced their open-coze. The front end is React + TS, and the back end uses Go. Since I didn't use Py or TS, and I have a bit more knowledge of Go, I started learning it.

The project structure is roughly as follows:

```bash
.
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

## crossdomain

Here, we mainly explain the design concept of crossdomain. Other designs are consistent with those mentioned on the official website, so you can refer to the official website.

When we encounter an interface logic of module A that involves operations on module B, and at the same time, the interface designed or provided by module B is insufficient to meet the requirements of Module A, it is generally due to inconsistent data structures: input parameters or output parameters.
So in A simple design architecture, some people often directly add methods in module B to meet the invocation requirements of module A. However, this actually disrupts the boundary design of domain design (the core idea of DDD is to clearly define the boundaries of the domain). Each module/bounded context should encapsulate its own business logic and data, 
and the single responsibility principle (a module should only be responsible for the business logic of its own domain)
At the same time, it has caused high coupling (direct dependencies can form bidirectional coupling, and any change in one module may trigger a chain reaction, leading to system rigidity.)

Then we need to introduce a separate layer to do this work. Cross-domain collaboration should be achieved through explicit adaptation mechanisms rather than implicit coupling, which is precisely the problem that 'crossdomain' aims to solve.
Take coze as an example. The agent module needs to implement the operation of agents, and each agent can call plugins, which belong to different modules. Therefore, cross-domain calls are inevitably involved here.
Then introduce `crossdomain/plugin`. Its role is to provide a specific interface, containing methods that are the specific designs required by the agent module. At the same time, pass in the actual plugin Domain Service as the default implementation to achieve calls between different domains.

At the same time, the design of crossdomain is essentially a horizontal layer architecture (has nothing to do with the level), the core aim of it is decoupled interaction across modules, thus can penetrate into the system of multiple layers (Domain/Application/Handler).
- At the Domain layer: Handle cross-domain model transformations (such as converting domain entities of Module B to domain value objects of Module A).
- At the Application layer: Coordinate cross-module Service calls (such as combining the Service of module B and the Logic of module A).
- At the Handler layer: Isolate protocol adaptations of different modules when handling external requests (such as API parameter conversion).