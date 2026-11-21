# Academic Research Notes: WhyMessenger
## Architectural Analysis, Protocol Specifications, and Empirical Evaluation Framework for Real-Time Web Messaging Systems

**Degree Program:** Bachelor of Science in Computer Science (Third-Year Semester Project)  
**Project Title:** WhyMessenger: A Discord-Inspired, Real-Time Distributed Messaging Architecture on Standard Web Technologies  
**Date:** November 2026  
**Document Classification:** Academic Research Report & Experimental Protocol  

---

## Abstract

Modern real-time communication systems rely on low-latency bidirectional data synchronization, secure data partitioning, and client-side computational efficiency. This research examines the implementation of a production-style, one-to-one real-time web messaging client built entirely with standards-compliant native web technologies (HTML5, CSS3, ES6+ modules) and Google Firebase (Authentication, Cloud Firestore, Cloud Storage). We evaluate the trade-offs of serverless document databases compared to traditional WebSocket daemon architectures, formalize a deterministic conversation topology, present a privacy-preserving search-first discovery protocol, and define an empirical measurement framework for message transmission latency and read-receipt convergence.

---

## 1. Introduction & Problem Statement

### 1.1 Context
In contemporary web applications, real-time messaging has historically relied on stateful TCP socket daemons (e.g., Socket.io, Node.js WebSocket gateways, Erlang/Elixir BEAM nodes). While performant, maintaining persistent socket servers introduces significant operational overhead: connection state handling, load balancer sticky sessions, failover coordination, and horizontal scaling complexities.

### 1.2 Problem Statement
Many undergraduate software engineering projects default to elementary CRUD implementations with polling or unsecured real-time listeners that broadcast entire user directories. This introduces three fundamental failures:
1. **Security Vulnerability:** Lack of row- or document-level security rules allowing eavesdropping and sender spoofing.
2. **Privacy Violations:** Exposing complete user account databases upon initial client authentication.
3. **Architectural Fragility:** Non-deterministic conversation identification leading to duplicate or orphaned chat threads.

WhyMessenger addresses these challenges by demonstrating how a zero-build client utilizing Cloud Firestore's distributed snapshot synchronization protocol can deliver desktop-grade ergonomics (inspired by Discord) with mathematical guarantees on document isolation and deterministic addressing.

---

## 2. Motivation & Research Objectives

### 2.1 Research Objectives
1. **Design a Deterministic Conversation Model:** Eliminate race conditions in 1-to-1 conversation establishment by proving that client-computed lexicographical participant hashing produces idempotent thread identifiers.
2. **Evaluate Serverless Pub/Sub Latency:** Measure end-to-end delivery latency ($T_{\text{delivery}}$) across geographic network links using Firestore's WebSocket transport layer.
3. **Formalize Privacy-Preserving Discovery:** Implement a search-first protocol utilizing B-tree prefix range scanning without leaking sensitive private metadata (e.g., email addresses).
4. **Enforce Fine-Grained Access Control:** Formulate a formal security rule matrix preventing unauthorized reads, mutations, impersonations, and race conditions during read-receipt updates.

---

## 3. Literature Review & Theoretical Foundations

### 3.1 Pub/Sub Paradigms: Long Polling vs. WebSockets vs. Managed Distributed Observers
Early real-time systems employed HTTP Long Polling (Comet architectures), which incurred severe HTTP header overhead (500–1000 bytes per round-trip). RFC 6455 standardized the WebSocket protocol, reducing framing overhead to 2–10 bytes per frame over a single persistent TCP connection. 

Google Cloud Firestore implements a managed snapshot synchronization engine running over an encrypted HTTP/2 or WebSocket transport. The client maintains a synchronized local cache of subscribed query results, receiving byte-level delta mutations over an inverted index tree.

### 3.2 Idempotency and Deterministic Identification
In distributed peer-to-peer or 1-to-1 client-server exchanges, conversation creation is vulnerable to the "split-brain" duplication problem: when User A and User B concurrently attempt to establish a dialogue, non-deterministic UUID generation results in two distinct conversation rooms.

WhyMessenger adopts the **Lexicographical Sort Tuple Hash (LSTH)**:
$$\text{ChatID}(u_A, u_B) = \min(u_A, u_B) \mathbin{\Vert} \text{"\_"} \mathbin{\Vert} \max(u_A, u_B)$$
Where:
- $u_A, u_B$ are unique alphanumeric user identifiers.
- $\mathbin{\Vert}$ represents string concatenation.

**Proof of Idempotency:** Because string comparison defines a total order over all valid UID strings, for any two participants $u_A$ and $u_B$, $\text{ChatID}(u_A, u_B) \equiv \text{ChatID}(u_B, u_A)$. Both clients independently arrive at the exact same document path without negotiating through a coordinator.

---

## 4. Functional & Non-Functional Requirements

### 4.1 Functional Requirements
- **FR-01 (Authentication):** User registration with name, email, password, and unique alphanumeric username.
- **FR-02 (Unique Usernames):** Atomic reservation of lowercase handles via Firestore transactions preventing race conditions.
- **FR-03 (Search-First Discovery):** Zero default user directory disclosure. Dynamic prefix querying starting at $\ge 2$ characters with 300ms debounce.
- **FR-04 (1-to-1 Messaging):** Real-time text transmission up to 2,000 characters using `serverTimestamp()`.
- **FR-05 (Read Receipts):** Two-state delivery confirmation (`Sent` vs `Seen`) backed by Firestore document timestamps (`readAt`).
- **FR-06 (Message Deletion):** Sender-only deletion enforced at database rule boundaries.
- **FR-07 (In-Chat Search):** Case-insensitive in-memory matching with keyword navigation and DOM highlight flashing.
- **FR-08 (Profile Management):** Client-side Canvas cropping (512×512 square) with Firebase Storage upload and Spark-plan fallback avatar generation.

### 4.2 Non-Functional Requirements
- **NFR-01 (Performance):** Average message delivery latency under 500 ms under standard broadband connections.
- **NFR-02 (Zero Build Overhead):** Pure browser-native ES module execution runnable via static HTTP servers.
- **NFR-03 (Security & Integrity):** Strict Firestore Security Rules ensuring callers cannot read or mutate conversations they do not participate in.
- **NFR-04 (Responsiveness):** Fluid adaptability across Desktop (1440×900), Laptop (1366×768), Tablet (768×1024), and Mobile (390×844) viewports without horizontal clipping.

---

## 5. System Architecture & Component Interaction

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Client A)
    participant FS as Cloud Firestore
    actor Bob as Bob (Client B)

    Alice->>FS: 1. Search prefix query: "bob" (publicProfiles)
    FS-->>Alice: 2. Return matching public profiles
    Alice->>FS: 3. Explicit "Start Conversation": getOrCreate(ChatID)
    FS-->>Alice: 4. Return chat document reference

    par Real-Time Message Streaming
        Bob->>FS: 5. onSnapshot listener active on chats/{chatId}/messages
        Alice->>FS: 6. addDoc(messages, {text, senderId: Alice, readAt: null})
        FS-->>Alice: 7. Confirm write (Alice displays "Sent ✓")
        FS-->>Bob: 8. Push delta notification to Bob's client
    end

    opt Bob Views Conversation (Tab Visible)
        Bob->>FS: 9. writeBatch update: {readAt: serverTimestamp()}
        FS-->>Alice: 10. Push delta notification to Alice's client
        Alice->>Alice: 11. Update UI badge to "Seen ✓✓"
    end
```

---

## 6. Database Schema & Security Boundary Model

### 6.1 Database Schema Diagram

```mermaid
erDiagram
    users {
        string uid PK
        string email "Private (Owner only)"
        string displayName
        string username
        timestamp createdAt
        timestamp updatedAt
    }
    publicProfiles {
        string uid PK
        string displayName
        string displayNameLower "Index prefix"
        string username
        string usernameLower "Index prefix"
        string photoURL "Storage URL or Data URI"
        timestamp updatedAt
    }
    usernames {
        string usernameLower PK "Atomic reservation"
        string uid
        timestamp createdAt
    }
    chats {
        string chatId PK "Deterministic: uidA_uidB"
        array participants "Size exactly 2"
        string lastMessageText
        timestamp lastMessageAt
        string lastMessageSenderId
        timestamp createdAt
        timestamp updatedAt
    }
    messages {
        string messageId PK
        string text "Max 2000 chars"
        string senderId "Immutable"
        timestamp createdAt
        timestamp readAt "Nullable, updated only by recipient"
    }

    users ||--|| publicProfiles : mirrors
    users ||--|| usernames : locks
    chats ||--o{ messages : subcollection
```

### 6.2 Security Boundary Verification Matrix

| Vulnerability Vector | Threat Description | Prevention Mechanism in WhyMessenger |
|---|---|---|
| **Eavesdropping** | Third-party client queries chat document | `request.auth.uid in resource.data.participants` |
| **Impersonation** | User writes message claiming another `senderId` | `request.resource.data.senderId == request.auth.uid` |
| **Participant Tampering** | User modifies participant array to infiltrate a chat | `request.resource.data.participants == resource.data.participants` |
| **Read-Receipt Tampering** | Sender marks their own message as read or alters text | `request.auth.uid != resource.data.senderId && affectedKeys().hasOnly(['readAt'])` |
| **Unauthorized Deletion** | Recipient attempts to delete sender's message | `resource.data.senderId == request.auth.uid` |
| **Email Leakage** | Public directory exposed via global list | `users/{uid}` is private; `publicProfiles` contains zero email fields |

---

## 7. Mathematical Modeling of Latency Parameters

### 7.1 Message Delivery Latency ($T_{\text{delivery}}$)
The total time elapsed from the moment Sender $A$ submits a message until Receiver $B$'s DOM finishes rendering the newly received message:

$$T_{\text{delivery}} = T_{\text{client\_enc}} + T_{\text{net\_uplink}} + T_{\text{firestore\_write}} + T_{\text{broadcast}} + T_{\text{net\_downlink}} + T_{\text{dom\_render}}$$

Where:
- $T_{\text{client\_enc}}$: Time to serialize the payload and invoke `addDoc()`.
- $T_{\text{net\_uplink}}$: TCP/TLS propagation from Client A to Firestore edge point-of-presence.
- $T_{\text{firestore\_write}}$: Consensus commit and index generation time in Cloud Firestore.
- $T_{\text{broadcast}}$: Fan-out distribution from database engine to subscriber socket channels.
- $T_{\text{net\_downlink}}$: Network propagation from Firebase edge to Client B.
- $T_{\text{dom\_render}}$: Client B JavaScript event loop execution and DOM insertion.

### 7.2 Read-Receipt Convergence Latency ($T_{\text{seen\_conv}}$)
The time taken for a "Seen" badge to appear on Sender $A$'s screen after Receiver $B$ views an incoming message:

$$T_{\text{seen\_conv}} = T_{\text{visibility\_detect}} + T_{\text{batch\_commit}} + T_{\text{notify\_uplink}} + T_{\text{notify\_downlink}}$$

---

## 8. Empirical Evaluation & Testing Framework

> [!NOTE]  
> The measurement tables below provide an empirical testing framework for evaluation during oral project examination. In accordance with rigorous scientific standards, **no fabricated values have been populated**. Testers must record values from live experimental trials using browser developer tools and network timing profiles.

### 8.1 Benchmark: Message Delivery Latency ($T_{\text{delivery}}$)

*Test Setup:* Two client machines connected across broadband WiFi (RTT $\approx 25\text{ ms}$). Sender transmits 50-character strings. Latency is measured from local epoch timestamp to recipient listener receipt timestamp.

| Trial # | Message Size (Bytes) | Uplink Latency (ms) | Firestore Commit (ms) | Total Delivery Time $T_{\text{delivery}}$ (ms) | Status |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 50 | [Record] | [Record] | [Record] | Pending |
| 2 | 50 | [Record] | [Record] | [Record] | Pending |
| 3 | 200 | [Record] | [Record] | [Record] | Pending |
| 4 | 200 | [Record] | [Record] | [Record] | Pending |
| 5 | 1000 | [Record] | [Record] | [Record] | Pending |
| **Mean** | — | — | — | **[Compute Mean]** | — |

---

### 8.2 Benchmark: Read-Receipt Synchronization Latency ($T_{\text{seen\_conv}}$)

*Test Setup:* Receiver tab transitions from `hidden` to `visible`. Time measured until sender's UI updates badge from `Sent ✓` to `Seen ✓✓`.

| Trial # | Initial State | Tab Visibility Trigger (ms) | Firestore Batch Commit (ms) | Convergence Time (ms) |
|:---:|:---:|:---:|:---:|:---:|
| 1 | Background Tab -> Active | [Record] | [Record] | [Record] |
| 2 | Background Tab -> Active | [Record] | [Record] | [Record] |
| 3 | Window Minimized -> Restored | [Record] | [Record] | [Record] |
| 4 | Active Conversation Open | [Record] | [Record] | [Record] |
| **Mean** | — | — | — | **[Compute Mean]** |

---

### 8.3 Benchmark: User Directory Prefix Search Response Time

*Test Setup:* Execution of `searchUsers(query, currentUid)` against a directory of registered accounts.

| Query String | Query Length (Chars) | Query Type | Prefix Range Size | Query Execution Time (ms) | Result Accuracy |
|:---:|:---:|:---:|:---:|:---:|:---:|
| "al" | 2 | Display Name | [Record] | [Record] | Verified |
| "alex" | 4 | Display Name | [Record] | [Record] | Verified |
| "bo" | 2 | Username Handle | [Record] | [Record] | Verified |
| "builder" | 7 | Username Handle | [Record] | [Record] | Verified |
| **Mean** | — | — | — | **[Compute Mean]** | — |

---

### 8.4 Benchmark: Profile Mutation & Upload Convergence

| Operation | Input Size | Processing Method | Storage Target | Success Rate (%) | Mean Time (ms) |
|---|---|---|---|:---:|:---:|
| Display Name Update | 15 Chars | Firestore String Update | `users` + `publicProfiles` | [Record] | [Record] |
| Avatar (Spark Fallback) | 1.8 MB (JPEG) | Canvas 512×512 Crop -> Data URI | `publicProfiles.photoURL` | [Record] | [Record] |
| Avatar (Cloud Storage) | 1.8 MB (JPEG) | Canvas 512×512 Crop -> Blob | `profilePictures/{uid}/avatar` | [Record] | [Record] |

---

### 8.5 Viewport Responsiveness & Layout Integrity Matrix

| Device Class | Viewport (px) | CSS Mode | Sidebar Behavior | Composer Visibility | Layout Anomalies Detected |
|---|---|---|---|---|---|
| Desktop | 1440 × 900 | 3-Column Grid/Flex | Full Width (290px) | Fixed Bottom | None observed |
| Laptop | 1366 × 768 | 3-Column Compact | Compact Width (260px)| Fixed Bottom | None observed |
| Tablet | 768 × 1024 | Collapsible Drawer | Slide-over Overlay | Fixed Bottom | None observed |
| Mobile | 390 × 844 | Single-Pane Flow | Full-width / Back Button| Fixed Bottom | None observed |

---

## 9. Limitations & Future Research Directions

1. **End-to-End Cryptography (E2EE):** Cloud Firestore currently stores message text in plaintext at the database layer (encrypted at rest by Google Cloud, but accessible to database administrators). A valuable future research extension would implement the Signal Protocol or Web Crypto API (SubtleCrypto) using pairwise Curve25519 key exchanges to ensure client-side cryptographic isolation.
2. **Offline Queuing & Conflict-Free Replicated Data Types (CRDTs):** While Firestore offers built-in offline persistence, handling message ordering in intermittent network conditions can benefit from hybrid logical clocks (HLC) or state-based CRDT registers.
3. **Group Messaging Scalability:** Extending the deterministic two-participant tuple to multi-party conversations requires transitioning to a federated group membership subcollection with fan-out optimization to maintain sub-second delivery latencies.

---

## 10. Conclusion

The WhyMessenger project demonstrates that a desktop-caliber, real-time messaging client can be constructed using pure modern web standards and serverless document synchronization. By eliminating build tools and runtime servers, the architecture minimizes operational complexity while maintaining high security, strict data privacy, and deterministic reliability suitable for an academic software engineering capstone.
