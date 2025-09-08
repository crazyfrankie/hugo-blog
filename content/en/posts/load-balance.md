---
title: "Load Balancing"
date: 2025-09-02T10:00:00+08:00
draft: false
categories: ["Technology"]
tags: ["Load Balancing", "System Design", "Microservices"]
---

## Overview

In a distributed environment, each microservice will have different instances. Service registration and service discovery solve the problem of "what are the available instances", and the remaining question is "who should I send the request to with so many available instances?". The question that remains is, "With so many available instances, who do I send the request to? Intuitively, most people, if they have heard of some specialized terminology, will directly think of "load balancing". What exactly is load balancing?

>What is load balancing?
> Load balancing is a method of evenly distributing network traffic among the pool of resources supporting an application. Modern applications must handle millions of users simultaneously and return the correct text, video, images and other data to each user in a fast and reliable manner. To handle such a high volume of traffic, most applications have many resource servers that contain a lot of duplicate data between them. A load balancer is a device that sits between a user and a group of servers, acting as an unseen coordinator that ensures equal use of all resource servers.
> -- aws

In fact load balancing is a means and not an end. So in terms of ends, we don't really need load balancing, our goal is to forward requests to the node that is "best suited" to handle the request. Best suited means:
- If the request requires a lot of memory, then forward it to the node with the most memory.
- If the request is CPU-intensive, then forward it to a request with a free CPU.
- ......
  Obviously, most of the time, we will want to forward the request to the node that "can return the fastest response".

## The Nature of Load Balancing

In this case: load balancing is essentially a simplified model. That is, if our goal is to pick the most suitable node, we have to set a criterion. This criterion, in turn, is simplified to "load"
. In other words, we consider the one with the lightest load to be the most suitable. Considering that all nodes provide the same service, the fact that you pick the node with the lightest load every time results in a roughly balanced load across all nodes.
For example, suppose there is a restaurant, a total of five waiters, when some dishes are ready, at this time may be part of the waiter is serving food to other guests, some are very free, at this time, how to distribute these dishes to the waiter to achieve high efficiency so that all the guests have eaten on the process can be regarded as load balancing. In this scenario, the concept of load is actually how many dishes are being processed by each server, more is called high load, less is called low load.

## Load Balancing Algorithm

The concept and nature of load balancing has been mentioned above, so how to implement load balancing? We call the rules or methods used in this process of implementing load balancing as load balancing algorithms. They can be roughly divided into two categories: static load balancing algorithms and dynamic load balancing algorithms.
**Static load balancing algorithms: static load balancing algorithms follow fixed rules, independent of the current server state. **
The main ones are: polling, weighted polling, random, weighted random, hashing, and consistent hashing.

### Polling

The polling algorithm is very effective and is probably the most widely used load balancing algorithm. The idea of polling is very simple, i.e., one node at a time. Although the polling algorithm is simple (and so is the implementation), it works very well. It should be said that, in most cases, there will be no problem using the polling algorithm directly. But polling itself has two assumptions:
- All servers have the same processing power.
- All requests require the same amount of resources.
  In practice, these two assumptions, especially the second one, do not hold. Therefore, when polling is used too much, it is inevitable to encounter occasional load imbalance problems.
  A typical example is when a node receives a large request and blows itself out.

#### Weighted Polling

Weighted polling is an improvement on polling. The algorithm is still largely polling, but instead of polling one node per request, it polls by weight. Those with more weights get more requests, and those with less weights get fewer requests. Most of the time, the weights represent the processing power (importance, priority, etc.) of the server node. There are also rare cases where nodes in the same server room and city will have higher weights in a multi-live scenario.
So how do you get weights? Under the registry model, weights are basically passed through the registry. That is, each server-side node will register its own weight information as well when it starts up. The client will be able to get the corresponding weight information during the service discovery process. However, ordinary weighted polling has a defect: server-side nodes with high weights will receive multiple requests in succession. In the following figure, B
will receive two requests in a row, and C will receive three requests in a row.

{{< lightbox src="/images/load-balance/img-1.png" width="700px" >}}

#### Smooth weighted polling

The weighted polling algorithm is based on the weighted algorithm and introduces a `currentWeight` concept. Each time a node is selected, the
`currentWeight`. Thus a node has two weights: the initial weight and the current weight. The steps of the whole algorithm are:
- Calculate the sum of all the initial weights, which is the total weight.
- For each node, let its current weight be added to the initial weight.
- Select the node with the largest current weight and send the request.
- Subtract the current weight of the selected node from the total weight.
  Code example:
```go
/*
   Implementation of Smooth Weighted Polling Algorithm
*/

package loadbalance

import (
	"fmt"
	"sync"
	"testing"
)

type Node struct {
	name       string
	weight     int
	currWeight int
}

func (n *Node) Invoke() {}

type Balancer struct {
	nodes []*Node
	mux   sync.Mutex
	t     *testing.T
}

func TestSmoothWRR(t *testing.T) {
	// Simulate three nodes for a single service
	nodes := []*Node{
		{
			name:       "A",
			weight:     10,
			currWeight: 10,
		},
		{
			name:       "B",
			weight:     20,
			currWeight: 20,
		},
		{
			name:       "C",
			weight:     30,
			currWeight: 30,
		},
	}

	bl := &Balancer{
		nodes: nodes,
		t:     t,
	}

	for i := 1; i <= 6; i++ {
		t.Log(fmt.Sprintf("Before the %d request is sent,nodes %v", i, convert(nodes)))
		target := bl.pick()
		// Simulate rpc calls
		target.Invoke()
		t.Log(fmt.Sprintf("After the %d request is sent,nodes %v", i, convert(nodes)))
	}
}

func (b *Balancer) pick() *Node {
	b.mux.Lock()
	defer b.mux.Unlock()
	total := 0
	// Calculate the total weight
	for _, n := range b.nodes {
		total += n.weight
	}
	// Calculate current weights
	for _, n := range b.nodes {
		n.currWeight = n.currWeight + n.weight
	}

	// Pick a node
	var target *Node
	for _, n := range b.nodes {
		if target == nil {
			target = n
		} else {
			if target.currWeight < n.currWeight {
				target = n
			}
		}
	}

	b.t.Log("Current weight of the selected node", target)
	target.currWeight = target.currWeight - total
	b.t.Log("Weights of selected nodes minus total weights", target)
	return target
}

func convert(src []*Node) []Node {
	dst := make([]Node, 0, len(src))
	for _, n := range src {
		dst = append(dst, Node{
			name:       n.name,
			weight:     n.weight,
			currWeight: n.currWeight,
		})
	}

	return dst
}
```

Output results:
```bash
weighted_test.go:53: Before the 1st request is sent, nodes [{A 10 10} {B 20 20} {C 30 30}]
weighted_test.go:86: Current weights of selected nodes &{C 30 60}
weighted_test.go:88: Weights of selected nodes after subtracting total weights &{C 30 0}
weighted_test.go:57: nodes [{A 10 20} {B 20 40} {C 30 0}] after 1st request.
weighted_test.go:53: Before the 2nd request was sent, nodes [{A 10 20} {B 20 40} {C 30 0}].
weighted_test.go:86: current weight of selected nodes &{B 20 60}
weighted_test.go:88: Weight of selected nodes after subtracting total weights &{B 20 0}
weighted_test.go:57: nodes [{A 10 30} {B 20 0} {C 30 30}] after the 2nd request.
weighted_test.go:53: Before the 3rd request was sent, nodes [{A 10 30} {B 20 0} {C 30 30}].
weighted_test.go:86: Current weights of selected nodes &{C 30 60}
weighted_test.go:88: Weights of selected nodes after subtracting total weights &{C 30 0}
weighted_test.go:57: nodes [{A 10 40} {B 20 20} {C 30 0}] after the 3rd request.
weighted_test.go:53: Before the 4th request was sent, nodes [{A 10 40} {B 20 20} {C 30 0}].
weighted_test.go:86: Current weights of selected nodes &{A 10 50}
weighted_test.go:88: Weight of selected nodes after subtracting total weights &{A 10 -10}
weighted_test.go:57: nodes [{A 10 -10} {B 20 40} {C 30 30}] after the 4th request.
weighted_test.go:53: Before the 5th request was sent, nodes [{A 10 -10} {B 20 40} {C 30 30}].
weighted_test.go:86: Current weights of selected nodes &{B 20 60}
weighted_test.go:88: Weight of selected nodes after subtracting total weights &{B 20 0}
weighted_test.go:57: nodes [{A 10 0} {B 20 0} {C 30 60}] after the 5th request.
weighted_test.go:53: Before the 6th request was sent, nodes [{A 10 0} {B 20 0} {C 30 60}].
weighted_test.go:86: current weight of selected node &{C 30 90}
weighted_test.go:88: Weight of selected node after subtracting total weights &{C 30 30}
weighted_test.go:57: nodes [{A 10 10} {B 20 20} {C 30 30}] after the 6th request.
```

### Random

The randomization algorithm is even simpler than polling, it just picks one at random. From an implementation point of view, it is generating a random number, using the random number to divide by the total number of nodes, and the resulting remainder is the subscript of the node. The randomized algorithm makes two assumptions:
- The processing power of all servers is the same.
- The resources required for all requests are also the same.
And, the randomized algorithm also assumes that the node load is balanced for a sufficiently large number of requests. Of course, if you are particularly unlucky, you can experience load imbalance.

#### Weighted Random

Weighted random is similar to weighted polling, where each node is given a weight. The following diagram shows the basic idea of weighted randomization.
- Calculate a total weight T.
- Generate a random number r.
- Choose whichever node r falls in the interval of the total weight. There is no version of weighted randomization called smoothed weighted randomization because it is not useful.

{{< lightbox src="/images/load-balance/img-2.png" width="700px" >}}

### Hash

The core of the hashing algorithm is to compute a hash value based on business characteristics, and the remainder, divided by the total number of nodes, is the target node. You can look at hash and random together, then the random algorithm is to use random numbers, and the hash algorithm is to use business features to calculate the hash value. The so-called business features can be:
- Business ID
- Foreign key
- Unique index
- ......
Closely related to your business.

{{< lightbox src="/images/load-balance/img-3.png" width="700px" >}}

#### weighted hash

The weighted hash algorithm is also similar to the weighted random algorithm. As shown below, you replace the random number with a hash and it becomes a weighted hash algorithm.

{{< lightbox src="/images/load-balance/img-4.png" width="700px" >}}

#### Consistency hash

Consistent hashing is an improvement of the hash algorithm that introduces a similar ring. The same hash value is calculated, but the relationship between the hash value and the node is such that the hash value falls within a certain interval and will be processed by a specific one. So the advantage is that when nodes are added or subtracted, only a portion of the nodes hit by the request will change.

{{< lightbox src="/images/load-balance/img-5.png" width="700px" >}}

**Dynamic load balancing algorithm**
: Attempts to calculate the load of a node in real time. And in practice, we don't actually know how to quantitatively calculate the load of a node, so dynamic load balancing algorithms can only choose some metrics based on their respective understanding.
Common ones are:
- Minimum number of connections.
- Minimum number of active.
- Fastest response.

** In practice, however, none of these three algorithms are often used. **

### Minimum number of connections

The basic idea is that if the load on a node is high, then the number of connections to that node must be high. Each time a node is picked, the client looks at how many connections it has to all the candidate nodes and picks the node with the least number of connections. But there is a drawback:** if the connection is multiplexed (application-oriented rather than underlying multiplexing), i.e., a connection can be multiplexed by multiple requests at the same time, then the load may be higher for the one with fewer connections**.
for example, if there are ten connections on server A, then the load may be higher. For example, ten connections on server A may be multiplexed by 100 requests, but twelve nodes on server C may only be multiplexed by 50 requests.
But the reality is that requests are multiplexed. But the reality is that there are not many frameworks for request multiplexing***.
`grpc` implements connection multiplexing, but unfortunately it is not possible to take this algorithm when using grpc because it is not possible to get at how many connections there are at the bottom of grpc.

{{< lightbox src="/images/load-balance/img-6.png" width="700px" >}}

### Minimum number of active

The active count is the number of requests being processed. Obviously, the active request count is still more accurate. The client maintains a count of the number of active requests for each server-side node, and selects a node with the lowest active count each time it sends a request.

{{< lightbox src="/images/load-balance/img-7.png" width="700px" >}}

### Fastest response time

In short: pick the node that used to return the fastest response every time. This response time can be:
- Average response time
- 99 lines
- 999 lines
Normal recommended average response time or 99 lines.
** It is also the most reliable algorithm of the three. **

{{< lightbox src="/images/load-balance/img-8.png" width="700px" >}}

The problem with this is that if there is a situation where a big request hits node C, pulling its average response time to 1 second, and then all the rest of the requests just bounce back and forth between A and B, the reason is that the client keeps jumping back and forth between A and B. The reason is that the client keeps jumping back and forth.
and then all the rest of the requests will just bounce back and forth between A and B. The reason is that the client keeps thinking that its average response time is 1 second.
The reason is that the client has always thought that its average response time is 1 second, then it is because, when its average response time is one second, the client will never call the request to it again, and will not recalculate its average response time at all. The result is a vicious circle, a deadlock situation.

## Summary

### Load Balancing Summary

1. Should server processing power be considered?
    * Polling, randomization, hashing, minimum number of connections, minimum number of active are not considered.
    * The weighted version of the counterpart can then be used to represent the server's processing power.
2. What metrics are chosen to represent the current load of the server?
    * (Weighted) Polling, (Weighted) Random, Hash Nothing was chosen to rely on statistics.
    * Choose number of connections, number of requests, response time, number of errors ...... So you can just pick a few metrics and design your own load balancing algorithm.
3. do all requests require the same amount of resources? No, it's obviously not.
    * Large merchants with extremely large categories and large buyers with extremely large orders.
    * Load balancing that does not take into account the resources consumed by requests is prone to occasional bursting of a particular instance.
4. What load balancing algorithm to choose? In practice, we use polling when things go wrong, and then we talk about it when things go wrong.

### Weighting effects

Most of the time, we use weights to express a server's processing power, or importance, or priority.
The algorithms for using weights should be considered:

1. the weight of an instance is so large that it may be selected several times in a row, then the smoothing effect should be taken into account.
2. Combined with the actual results of the call to adjust the weight, for example, if the instance returned an error, then reduce the weight, and vice versa, increase the weight. 3.
3. If the weights of an instance are dynamically adjusted, then consider the upper and lower bounds, and especially consider whether the process of adjusting the weights will result in the weights becoming 0, the maximum value, or the minimum value. These three values may cause the instance not to be selected at all, or to be selected all the time.

### Limitations of the microservices framework

The three dynamic load balancing algorithms we talked about earlier: the minimum number of connections, the minimum number of active, and the fastest response time algorithms are all chosen by the client. But the client only knows its side of the story, that is:

1. the client only knows the number of connections between itself and each server node.
2. the client only knows the number of requests it has sent and not yet received.
3. the client only knows the response time of the requests it has sent.

{{< lightbox src="/images/load-balance/img-9.png" width="700px" >}}

For client 2, if it wants to send a request, in its opinion, it will choose server 1, but in reality, server 3 is the one with the least number of connections, the limitation is that client 2 it is not aware of the connections between client 1 and the other servers, it only knows the number of connections it has with the other servers. Summarized as **Microservices frameworks do not have global information**
. But **gateways** are capable of having global information, especially **single-instance gateways** , and multi-instance gateways must synchronize data to do so.

### Design your own load balancing algorithm

The core is to select some metrics to express the load of service instances according to your business characteristics.

1. other service metrics such as error rate.
2. hardware metrics such as CPU, IO, and network load.

To know these metrics, in addition to client-side statistics (some clients can't be counted, such as CPU per instance), there are a few oddities:

1. The server writes the value of the metrics to the registry, which notifies the client. 2.
2. each time the server returns a response, it additionally brings its own metrics, such as CPU utilization.
3. use our observability platform to get data from the observability platform.

{{< lightbox src="/images/load-balance/img-10.png" width="700px" >}}