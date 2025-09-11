---
title: "Architecture Design-Comment System"
date: 2025-09-11T10:00:00+08:00
categories: ["Technology", "Backend"]
tags: ["System Design", "Architecture Design"]
---

The most important thing in architectural design is to **understand the positioning of the entire product system in the system**. Only by figuring out the background behind the system can you make the best design and abstraction. Don’t be a translation machine for demand, first understand the essence behind the business and the original intention of the matter.

Comment system, when we go to the small, we are video comment system, when we go to the large, we are commenting platform, we can access various business forms.
- Post a comment: Support reply to floors and floors.
- Read comments: Sort by time and popularity.
- Delete comments: user deletes, author deletes.
- Management Comments: Author top, backend operation management (search, delete, review, etc.).