---
title: "DDD--从单体迁移到微服务"
date: 2025-09-16T10:00:00+08:00
draft: false
categories: ["后端", "技术"]
tags: ["DDD", "架构设计"]
---

DDD 是领域驱动设计，它的诞生是为了让互联网公司的开发效率更高，具体来说，它通过一套特定的描述语言，让 PM 和 RD 对于同一件事的描述不再是一方偏向用户，一方偏向技术。

那么在技术上的实践，它提供了一系列的概念，来引导我们在系统中使用这样的设计

我们以 coze 的开源版本代码为例讲解一下，然后再看看如何迁移到微服务下。

具体的 DDD 概念，可以参考[这里](https://domain-driven-design.org/zh/ddd-concept-reference.html)

## 单体 DDD

我在 [DDD 的一些思考](https://www.crazyfrank.top/zh/posts/ddd-的一些思考) 中提到过项目的组织，当时只介绍了 `crossdomain` ，这里我们把其他的也来看看

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

1. `api`: HTTP 接口处理
2. `application`: 应用层 service，负责业务编排，数据对象转换；不做具体的业务逻辑，利用各个领域服务解决问题
3. `domain`: 领域层 service，负责该领域内的业务逻辑，数据权限等，不关心场景，不关心业务规则，只在乎数据
4. `infra`: 基础设施层，提供外部资源适配（数据库、消息队列、RPC、HTTP、缓存等）

我们以一个具体的场景介绍一下吧。以`用户登录`为例：

我们在使用一些网站时总会需要登录，那么大家可以注意到现在很多网站都支持多种登录方式：Google、Github、手机号、邮箱、Apple 等。

那么如果我们要做这样一个登录接口，从 api 到 infra 具体需要怎么实现呢？

### 登录接口场景
首先 `api` 包不用多说，提供一个 HTTP 接口供前端调用；那么 `application` 层可能会提供多个方法以便支持不同登录方式，因为它的重点在业务编排和数据转换，
那么它只要在每个接口中把每种登录方式所需要的具体数据构建出来就可以；剩下的`domain`层具体要做的就是 `User` 模型的操作：查询和创建；
那么`infra` 提供的能力就是多种登录方式的封装：Google Auth、短信服务、邮箱服务等，同时还包含了 DB、Cache 等支持 `domain` 的数据操作。

## 如何迁移？
前提是我们迁移到微服务是 gRPC 或者其他的协议而不是 HTTP-RPC。

按我最开始学习微服务的想法，我会直接去掉 `api` 然后添加一个 `rpc` 层次。

因为在单体里：
- handler（api） 在最外层（REST/HTTP 接口入口）。
- application 编排业务用例。
- domain 写核心业务逻辑。
- infra 提供数据库、缓存等实现（被上层调用）。

所以我会下意识觉得：

RPC 就像是另一个“handler”，应该在 service 之上抽象，因为它是暴露服务给外部的。

但其实这样的思路是完全错误的。从 DDD 的本质上来说，因为 RPC 本质上算是一种通信机制，而不是业务语义。

- Application 的职责：定义并暴露业务用例（比如 UserApplicationService.CreateUser(cmd)）。

- Infra 的职责：负责技术实现，把不同的技术协议（DB、MQ、RPC、HTTP）适配到业务。

所以 RPC Server 只能算是一个 Adapter。那么具体的，我们再以一个模块示例。

### 微服务下的模块划分
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

这里重点关注两个模块 `infra` 下的 `rpc` 和 `crossdomain`。

#### rpc 、crossdomain
刚刚提到了它是作为一种基础设施，提供的能力是 rpc 通信。对于每个模块来说，它自身需要提供服务，所以这里必然包含一个 server.go，当然也可能是 server 包，

它的作用就是协议转换，请求对象的构建，然后将请求透传到 `application`，当然对于 gRPC，还提供了一些其他的，比如 metadata 的能力，这个逻辑可以放在 server 层，
也可以单独拿出来，最好的办法是用 gRPC 的 interceptor，去统一提取，后续自己从 ctx 中取就行。

同时，它也需要跨服务之间的调用，那么它必然需要其他模块的 client，这里也需要包含 client.go。

那 `crossdomain` 的作用呢？之前提到了单体下的 crossdomain 是作为一个防腐层，提供跨模块之间的调用封装，那单体下是直接进程内，微服务下就要用 rpc 了，
那刚刚提到了，跨服务之间的调用是由 rpc/client.go 实现的。

那分析到这里，其实就很明确了：
- `rpc/server`: 协议转换，请求构建，封装 application
- `rpc/client`: 构建 gRPC Client（连接、序列化、负载均衡、拦截器等），不做业务封装
- `crossdomain`: 定义和实现 ACL，依赖 infra/rpc client，做语义/协议转换，交给 application 或者 domain

这样的好处是把通信机制（infra）和业务进行了解耦，各司其职，职责划分明确。