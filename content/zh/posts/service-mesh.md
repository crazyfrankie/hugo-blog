---
title: "从服务注册与发现到服务网格"
date: 2025-10-13T10:00:00+08:00
draft: false
categories: ["技术", "后端"]
tags: ["服务注册与发现", "服务网格"]
---

## 服务发现与注册
在我们的系统引入微服务架构后，原来的各个模块间的交互由进程内通信转变成了进程间的通信，同时这些进程不止一个，同时这些进程在被调用时往往需要一些标识信息，否则调用者无法发起调用。**以下将调用者称为客户端、被调用者称为服务端**。

最简单的方式是直接通过 IP:Port 直连的方式，那我们刚刚也说到了，这些进程不止一个，对于 IP 直连的方式比较鸡肋，需要业务方统一管理，不太方便。那我们往往会采用一些组件将这个过程进行解耦，我们称为注册中心，常见的注册中心有：Zookeeper、ETCD、Consul、Nacos 等。
一般的流程是，每个服务端在启动服务时连接到注册中心，将自己的信息注册到注册中心，一般是 IP:Port，还可能包含一些元数据信息，由注册中心统一管理，当客户端发起调用时，会拿到一批该服务的地址信息，然后通过一些负载均衡算法挑选一个发起调用（这个过程一般由微服务框架解决）。这种方式是我们所常说的服务注册与发现机制

{{< lightbox src="/images/service-mesh/img-1.png" width="1000px" >}}

其实到这里，我们基本上已经可以解决大多数的微服务之间的通信问题了，但架构是不断演进的，当我们解决一个问题，自然会有新的问题。
新的问题是在当前的架构中，服务之间的通信（服务A调用服务B）变得非常复杂，比如服务注册、服务发现相关的代码都会耦合在业务代码中。同时伴随着服务发现与注册，我们还需要一些其他的通信逻辑，比如调用失败后的重试、超时管理、认证管理等，这些通信逻辑都写在业务代码里，会非常臃肿且难以管理。
举一个例子：
```go
// 需要显式处理服务发现
func (s *userService) CallMessageService(ctx context.Context) error {
    // 通过ETCD获取Message服务连接
    conn, err := s.discoveryClient.GetConn(ctx, "message-service")
    if err != nil {
        return err
    }

    client := messagepb.NewMessageServiceClient(conn)
    // 调用远程服务
    return client.SendMessage(ctx, req)
}
```

虽然这里看起来代码也不多，但实际上刚刚提到的这些逻辑都被封装在了discoveryClient内部，仍然是耦合在我们的业务层中，我们不希望业务层做太多的协议层方面的管理。软件开发中有一句话，没有什么是加一层解决不了的。于是我们往往会引入一个设计方式叫服务网格。

## 服务网格
服务网格的作用是将通信功能从业务代码中分离出来，大致的架构图是这样的

{{< lightbox src="/images/service-mesh/img-2.png" width="1000px" >}}

诶，好像看起来没有什么区别啊，都是调用者发起调用，然后向某个控制中心获取地址信息，再发起调用啊。
的确，从架构上看，差别不大，但从代码层面来看，复杂度减少了很多：

```go
// 应用代码完全不需要关心服务发现
func (s *userService) CallMessageService(ctx context.Context) error {
    // 直接连接到本地Sidecar，由Sidecar处理服务发现
    conn, err := grpc.NewClient("localhost:15001", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        return err
    }

    client := messagepb.NewMessageServiceClient(conn)
    // Sidecar会自动路由到正确的Message服务实例
    return client.SendMessage(ctx, req)
}
```

那引入这种网关之后，当客户端需要发起调用时，它不再需要知道对方究竟有多少个实例，也不需要知道对方的地址，它只需要把请求转发给 Sidecar， 它会去控制平面询问对方的实例数量以及地址信息，然后发起调用，之前提到的discoveryClient相关的代码也不再需要。对等的，在服务端也有对应的 Sidecar，它在这里会拦截请求，再转发到服务实例处理。

它的价值是，之前提到的各种通信逻辑，超时、重试、负载均衡、认证等等，都被业务层屏蔽掉了，全部交给了这个内部的网关，业务方只需要和网关通信，可以专注业务的代码。最终形成的架构模式，我们就称为服务网格。