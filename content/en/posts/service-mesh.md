---
title: "From Service Registration and Discovery to Service Mesh"
date: 2025-10-13T10:00:00+08:00
draft: false
categories: ["Technology", "Backend"]
tags: ["Service Registration and Discovery", "Service Mesh"]
---

## Service Discovery and Registration
After adopting a microservices architecture in our system, interactions between modules shifted from intra-process communication to inter-process communication. These processes are not limited to a single instance, and when invoked, they often require identifying information—otherwise, the caller cannot initiate the request. **Hereafter, the caller will be referred to as the client, and the called entity as the server.**

The simplest approach is direct IP:Port connection. However, as mentioned earlier, multiple processes exist, making direct IP connections impractical. This requires centralized management by the business team, which is inconvenient. Therefore, we typically use components to decouple this process, known as registration centers. Common registration centers include: Zookeeper, ETCD, Consul, Nacos, etc.
Typically, each server connects to the registry upon startup, registering its details—usually IP:Port along with metadata—for centralized management. When a client initiates a call, it retrieves a pool of service addresses and selects one via load balancing algorithms (often handled by the microservice framework). This constitutes the service registration and discovery mechanism.

{{< lightbox src="/images/service-mesh/img-1.png" width="1000px" >}}

At this point, we can already address most communication challenges between microservices. However, architecture evolves continuously—solving one problem inevitably introduces new ones.
The new challenge is that service-to-service communication (Service A calling Service B) becomes highly complex within the current architecture. For instance, code related to service registration and discovery becomes tightly coupled with business logic. Additionally, alongside service discovery and registration, we require other communication logic—such as retries after failed calls, timeout management, and authentication handling. When this communication logic is embedded within business code, it leads to bloated and difficult-to-manage systems.
Consider this example:
```go
// Explicit service discovery handling required
func (s *userService) CallMessageService(ctx context.Context) error {
    // Retrieve Message service connection via ETCD
    conn, err := s.discoveryClient.GetConn(ctx, "message-service")
    if err != nil {
        return err
    }

    client := messagepb.NewMessageServiceClient(conn)
    // Invoke remote service
    return client.SendMessage(ctx, req)
}
```

Although the code here appears concise, the logic mentioned earlier is encapsulated within the discoveryClient, remaining coupled to our business layer. We don't want the business layer to handle excessive protocol-level management. As the saying goes in software development, there's nothing a layer can't solve. Thus, we often introduce a design pattern called a service mesh.

## Service Mesh
A service mesh separates communication functionality from business logic. The basic architecture looks like this:

{{< lightbox src="/images/service-mesh/img-2.png" width="1000px" >}}

Hmm, it doesn't seem much different—the caller still initiates the call, fetches address info from a control center, then makes the call.
Indeed, architecturally the difference is minimal. However, at the code level, complexity is significantly reduced:

```go
// Application code requires zero concern for service discovery
func (s *userService) CallMessageService(ctx context.Context) error {
    // Directly connects to local Sidecar, which handles service discovery
    conn, err := grpc.NewClient("localhost:15001", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
        return err
    }

    client := messagepb.NewMessageServiceClient(conn)
    // Sidecar automatically routes to the correct Message service instance
    return client.SendMessage(ctx, req)
}
```

After introducing this gateway, when a client needs to initiate a call, it no longer needs to know how many instances exist or their addresses. It simply forwards the request to the Sidecar, which queries the control plane for the number of instances and their addresses before making the call. The previously mentioned discoveryClient-related code is no longer required. Similarly, the server side also has a corresponding Sidecar. Here, it intercepts requests and forwards them to the service instance for processing.

Its value lies in abstracting away various communication logic—timeouts, retries, load balancing, authentication, etc.—from the business layer. All these are handled by this internal gateway. The business side only needs to communicate with the gateway, allowing it to focus solely on business logic. The resulting architectural pattern is what we call a service mesh.