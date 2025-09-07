---
title: "DDD 的一些思考"
date: 2025-09-04T10:00:00+08:00
draft: false
categories: ["技术", "后端"]
tags: ["DDD", "系统设计"]
---

## 项目介绍
叠甲，写这篇文章主要是分享在看 DDD 的项目实践中的一些学习感悟，因为本人懒得看理论，所以都只是猜测 DDD 要这么设计。具体还是要参考 DDD 官方网站： [DDD 概念介绍](https://domain-driven-design.org/zh/ddd-concept-reference.html)

最近字节开源了它们的 open-coze，前端是 React + TS，后端采用了 Go，刚好没有使用 Py 或者 TS，加上本人对 Go 了解多一点，于是开始学习。

大致上项目结构是这样的：

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
这里主要讲解 crossdomain 的设计理念，其他的设计跟官网提到的一致，所以可以参考官网。

当我们遇到 A 模块的某个接口逻辑中涉及到对 B 模块的操作，而同时 B 模块所设计或者说提供的接口不足以满足 A 的要求，一般来说就是数据结构不一致：入参或出参。
所以在简易的设计架构中，有人往往会直接在 B 模块添加方法以满足 A 模块的调用，但这样其实是破坏了领域设计的边界设计（DDD 的核心思想是明确划分领域边界，每个模块 / 限界上下文应封装自己的业务逻辑和数据）、单一职责原则（模块应仅对自己领域的业务逻辑负责），
同时造成了高耦合性（直接依赖会形成双向耦合，任何一个模块的变更都可能引发连锁反应，导致系统僵化。）

那么我们需要引入一个单独的层次来做这个工作，跨领域协作应通过显式的适配机制而非隐式的耦合实现，这正是 `crossdomain` 要解决的问题。
以 coze 为例，agent 模块需要实现 agent 的运行，而每个 agent 都可以调用 plugin，而它们分属不同的模块，那么这里必然涉及到跨领域之间的调用，
那么引入 `crossdomain/plugin`，它的作用是提供一个特定的接口，包含的方法是 agent 模块所需要的特定设计，同时将实际的 plugin Domain Service 传入作为默认实现，以此达到不同领域之间的调用。

同时，crossdomain 的设计本质上是一种横向的架构层（与层级无关），它的核心目标是解耦跨模块的交互，因此可以渗透到系统的多个层次（Domain/Application/Handler）。
- 在 Domain 层：处理跨领域的模型转换（如将 B 模块的领域实体转换为 A 模块的领域值对象）。
- 在 Application 层：协调跨模块的服务调用（如组合 B 模块的 Service 和 A 模块的 Logic）。 
- 在 Handler 层：处理外部请求时隔离不同模块的协议适配（如 API 参数转换）。

