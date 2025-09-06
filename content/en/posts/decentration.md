---
title: "Understanding Decentralization Through Log Processing"
date: 2025-09-05T10:00:00+08:00
draft: false
categories: ["Technology"]
tags: ["Distributed Systems", "Decentralization", "System Design"]
---

This article explores decentralized system design concepts and implementation approaches through the lens of log processing.

## Overview of Decentralized Systems

Decentralization is a key concept in distributed system design that improves system reliability and fault tolerance by distributing control across multiple nodes.

In architecture, "decentralization" doesn't necessarily mean "completely no center," but rather:
- Avoid irreplaceable single points of failure by using distributed, peer-to-peer nodes to share responsibilities
- System availability and scalability don't depend on any single critical node

## Log Processing
{{< lightbox src="/images/decentration/img-1.png" alt="Centralized Architecture Diagram" width="1200px" >}}

Taking the [ELK](https://www.elastic.co/elastic-stack) log processing architecture as an example:

{{< admonition note "ELK Production" >}}
Brief introduction to the diagram structure:
ELK is a log processing architecture where `AppServer` (microservices) logs are uniformly collected by `LogStash Agent` for proxy collection, analyzed, filtered, and then sent to remote `Elastic Search` for storage.
`Elastic Search` stores data in compressed shards and provides various APIs for user queries and operations. Users can also intuitively configure `Kibana Web` for convenient log querying and data report generation.
{{< /admonition >}}

In traditional centralized systems, all requests need to be processed through a central server, the `Server` role, which in this case is `LogStash`. This often creates single points of failure and centralized hotspot issues: `Once Logstash fails, the entire pipeline breaks`. Although the diagram shows only two machines, it can be scaled, but essentially this architectural pattern remains unchanged. Logstash is still heavy, resource-intensive, and has high latency. Meanwhile, the number of microservices continues to grow.

{{< lightbox src="/images/decentration/img-2.png" alt="Decentralized Architecture Diagram" width="1200px" >}}

Therefore, we often design microservices with decentralization in mind. For example, the currently more popular `EFK` architecture essentially removes the Logstash Server role and changes log reporting from centralized to distributed.
Specifically, we often use components like `Filebeat` (a component from ES's official open-source `beats` project), which is deployed locally on each microservice. Each service writes logs to local files, which are then read, analyzed, and filtered by Filebeat, forming distributed collection before sending to Elastic Search for storage. This is actually a decentralized design approach that replaces the collection and processing with distributed single-point processing, reducing hotspot issues.

### Further Decentralized Architecture

In actual enterprise applications, we can further optimize by introducing message queues between the collection layer and storage layer:

{{< lightbox src="/images/decentration/img-3.png" alt="EFK+Kafka Architecture Diagram" width="1200px" >}}

Advantages of this architecture:
- **Decentralized collection layer**: Each machine runs agents independently
- **Distributed message middleware**: Kafka cluster distributes log traffic, avoiding overwhelming ES directly
- **Distributed storage layer**: ES has built-in sharding and replication mechanisms

The entire pipeline has no single "center," achieving truly decentralized log processing.

## Centralized vs Decentralized Architecture Comparison

{{< comparison-table headers="Feature|Centralized (ELK)|Decentralized (EFK)" >}}
Single Point of Failure Risk|High (Logstash failure breaks entire pipeline)|Low (single agent failure only affects local machine)
Resource Consumption|Logstash heavy, high resource usage|Filebeat lightweight, low resource usage
Scaling Method|Vertical scaling, high cost|Horizontal scaling, naturally distributed
Latency|Centralized processing, higher latency|Local processing, lower latency
Operational Complexity|Need to maintain Logstash cluster|DaemonSet automatic deployment
{{< /comparison-table >}}

## Key Principles of Decentralized Design
To be considered "decentralized," systems generally need to meet the following conditions (not all required, but should move in this direction):
1. Multiple entry points, avoiding single point dependencies
   - No single node/service is the only "center"
   - For example, Kafka clusters allow logs to be sent to multiple brokers; clients don't depend on any specific broker
2. Horizontal scaling
   - Nodes are peer-like, distributing load by adding nodes rather than piling all requests on one node
   - For example, ES itself is decentralized storage with data shards distributed across different nodes
3. Fault tolerance and redundancy
   - Any single node failure doesn't affect overall functionality, or the impact is acceptable (partial degradation rather than complete failure)
   - Raft leader election avoids single points; if the leader fails, a new one can be elected
4. Autonomy and loose coupling
   - Each node can independently complete its responsibilities without relying entirely on central scheduling
   - For example, logs written directly to local agents (Filebeat/Fluent Bit) that asynchronously push downstream, rather than crowding into Logstash

## Decentralization in Cloud-Native Environments

In Kubernetes environments, EFK architecture is particularly suitable:

- **DaemonSet deployment**: Fluent Bit deployed as DaemonSet, automatically covering all nodes
- **Auto-discovery**: Automatically discovers new Pod and container logs
- **Resource isolation**: Each node's agent runs independently without affecting others

This pattern perfectly aligns with cloud-native decentralized scheduling philosophy.

## Summary

Through the evolution of log processing architecture, we can see the core ideas of decentralized design:

1. **Eliminate single point dependencies**: From relying on single Logstash to distributed agents
2. **Improve fault tolerance**: Local failures don't affect the global system
3. **Enhance scalability**: Horizontal scaling replaces vertical scaling
4. **Reduce operational costs**: Automated deployment and management

Decentralization isn't a silver bullet, but in appropriate scenarios, it can significantly improve system reliability and scalability. When choosing architecture, we need to weigh based on specific business requirements and technical constraints.
