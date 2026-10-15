# Web Services and SOA — Laboratory 7

## API Gateway, Configuration-Based Service Discovery & Cloud Deployment

**Course**: Web Services & Service Oriented Architecture (IT604 / IT-SOA)  
**Institution**: Dhirubhai Ambani Institute of Information and Communication Technology (DA-IICT)  
**Student Name**: Varunee Agrawal  
**Student ID**: 202512067  
**GitHub Repository**: [https://github.com/varunee-it/campus-connect-microservices](https://github.com/varunee-it/campus-connect-microservices) (Branch: `main`)  
**Render Blueprint**: `campus-connect-lab7`  
**Live API Gateway URL**: [https://campusconnect-api-gateway-xg0y.onrender.com](https://campusconnect-api-gateway-xg0y.onrender.com)  

---

## 1. Executive Summary & Objective

In **Lab 6**, the backend system was decomposed into three independently runnable microservices: **User Service**, **Product Service**, and **Order Service**. While they communicated directly over a Docker bridge network (`campus-network`), the API Gateway was introduced only as an architectural concept.

**Lab 7** operationalizes that architecture by:

1. **Building a Real API Gateway**: Serving as the single, unified ingress point for all client traffic, routing `/users/*`, `/products/*`, and `/orders/*` without housing any backend business logic.
2. **Configuration-Based Service Discovery**: Eliminating hard-coded microservice hostnames/IPs from route code by externalizing service locations into environment variables/configuration files (`USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`).
3. **Cross-Cutting Concerns**: Implementing centralized request logging (method, path, target service, response status code, latency), an independent `GET /health` check, and graceful `502 Bad Gateway` / `503 Service Unavailable` error handling.
4. **Network Isolation**: Enforcing strict container network boundaries—only the API Gateway's port (`8000`) is exposed externally, leaving microservices isolated and reachable only within the internal Docker network.
5. **Cloud Deployment**: Containerizing the system and deploying the Gateway and services to the cloud (Render) so they are reachable over the public internet while communicating with the persistent MongoDB Atlas cluster.

> **Key Rule Preserved**: The resource design, schemas, endpoints, business logic, and HTTP status codes of the Lab 6 microservices remain **100% unchanged**.

---

## 2. Technology Stack

- **Runtime & Language**: Node.js (v20+ / v24) & Express.js
- **Reverse Proxy**: `http-proxy-middleware` (v3.0.3)
- **CORS Handling**: `cors` (v2.8.5)
- **Inter-service Communication**: Axios (v1.7.9) with bounded timeouts (3000ms)
- **Database & ODM**: MongoDB Atlas & Mongoose (v8.8.2)
- **Containerization & Orchestration**: Docker (Engine 29+) & Docker Compose (v2)
- **Automated Testing**: Node.js Native Test Runner (`node:test`, `node:assert`)
- **Cloud Deployment**: Render Cloud Platform (Web Services & Docker Blueprints)
- **API Testing**: Postman Collection v2.1

---

## 3. System Architecture

### 3.1 Mermaid Architecture Diagram

```mermaid
flowchart TD
    Client["Client / Postman\n(Public Internet / Host Machine)"]
    
    subgraph Edge ["Public Gateway Layer"]
        Gateway["API Gateway (Port 8000)\n• Ingress Reverse Proxy\n• Centralized Request Logging\n• Centralized 502/503 Error Handling\n• Health Check (/health)\n• Service Registry Config"]
    end
    
    subgraph DockerNet ["Docker Private Network: campus-network (Isolated)"]
        UserService["User Service\n(Port 3001 - Internal Only)\n• User & Student Accounts"]
        ProductService["Product Service\n(Port 3002 - Internal Only)\n• Product Catalog & Stock"]
        OrderService["Order Service\n(Port 3003 - Internal Only)\n• Order Processing & State"]
        
        OrderService -->|Inter-service HTTP Verification| UserService
        OrderService -->|Inter-service HTTP Verification| ProductService
    end
    
    subgraph CloudDB ["MongoDB Atlas (Cloud Cluster)"]
        UserDB[("campus_user_db")]
        ProductDB[("campus_product_db")]
        OrderDB[("campus_order_db")]
    end
    
    Client -->|HTTP Ingress| Gateway
    Gateway -->|/users and /users/*| UserService
    Gateway -->|/products and /products/*| ProductService
    Gateway -->|/orders and /orders/*| OrderService
    
    UserService -->|TLS Connection| UserDB
    ProductService -->|TLS Connection| ProductDB
    OrderService -->|TLS Connection| OrderDB
```

### 3.2 Network Boundaries (Local vs. Cloud)

- **Local Docker Compose**: The API Gateway container publishes port `8000:8000` to the host machine. The User (`3001`), Product (`3002`), and Order (`3003`) services use `expose` to communicate strictly over the internal bridge network `campus-network`. External clients cannot access backend microservices directly.
- **Cloud (Render)**: In the cloud, the API Gateway is deployed as a public web service with a public URL ([`https://campusconnect-api-gateway-xg0y.onrender.com`](https://campusconnect-api-gateway-xg0y.onrender.com)). Backend microservices are deployed as containerized web services whose locations are injected into the gateway via dynamic Render environment variables.

---

## 4. Gateway Endpoints & Routing Table

The API Gateway acts as the single entry point, routing requests while preserving query parameters, headers, HTTP methods, and bodies:

| Ingress Gateway Path | HTTP Method | Target Backend Service | Target Internal URL                         | Description                                            |
| :------------------- | :---------- | :--------------------- | :------------------------------------------ | :----------------------------------------------------- |
| `GET /health`        | `GET`       | **API Gateway**        | _(Handled locally, no proxying)_            | Returns gateway status UP, port, and service registry  |
| `/users`             | `GET`       | **User Service**       | `http://user-service:3001/users`            | Fetch all user and student records                     |
| `/users/{id}`        | `GET`       | **User Service**       | `http://user-service:3001/users/{id}`       | Fetch user by ID                                       |
| `/users`             | `POST`      | **User Service**       | `http://user-service:3001/users`            | Create a new user/student                              |
| `/users/{id}`        | `PUT`       | **User Service**       | `http://user-service:3001/users/{id}`       | Update existing user/student                           |
| `/users/{id}`        | `DELETE`    | **User Service**       | `http://user-service:3001/users/{id}`       | Delete user/student                                    |
| `/products`          | `GET`       | **Product Service**    | `http://product-service:3002/products`      | Fetch product catalog                                  |
| `/products/{id}`     | `GET`       | **Product Service**    | `http://product-service:3002/products/{id}` | Fetch product by ID                                    |
| `/products`          | `POST`      | **Product Service**    | `http://product-service:3002/products`      | Create new product item                                |
| `/products/{id}`     | `PUT`       | **Product Service**    | `http://product-service:3002/products/{id}` | Update product item                                    |
| `/products/{id}`     | `DELETE`    | **Product Service**    | `http://product-service:3002/products/{id}` | Delete product item                                    |
| `/orders`            | `GET`       | **Order Service**      | `http://order-service:3003/orders`          | List all orders                                        |
| `/orders/{id}`       | `GET`       | **Order Service**      | `http://order-service:3003/orders/{id}`     | Fetch order by ID                                      |
| `/orders`            | `POST`      | **Order Service**      | `http://order-service:3003/orders`          | Create order (validates user & product before storing) |

---

## 5. Discussion Questions & Analysis

### Question 1: Why introduce an API Gateway instead of letting clients call each service directly?

Direct client-to-service communication creates significant architectural, operational, and security liabilities:

1. **Single Public Ingress Point & Encapsulation**: Without a gateway, clients must know and manage multiple hostnames, IP addresses, and ports. Any backend refactoring, service splitting, or migration breaks clients. The API Gateway shields the internal topology behind a uniform domain.
2. **Security & Attack Surface Reduction**: Directly exposing microservices requires opening multiple firewall ports. With an API Gateway, only one entry port (8000) is exposed, and microservices remain completely shielded inside a private network.
3. **Centralization of Cross-Cutting Concerns**: Observability (structured logging, request duration tracking), CORS configuration, rate limiting, and uniform error translation belong at the ingress edge. Repeating these across every microservice leads to duplication and configuration drift.
4. **Resilience & Controlled Error Responses**: If a backend service crashes, direct client calls produce raw connection resets or indefinite timeouts. The gateway intercepts backend failures and returns standardized JSON `502 Bad Gateway` or `503 Service Unavailable` responses.

---

### Question 2: Static / Config-Based Discovery vs. Dynamic Service Discovery

In this lab, we implemented **configuration-based service discovery**, where service network locations are externalized into environment variables (`USER_SERVICE_URL`, `PRODUCT_SERVICE_URL`, `ORDER_SERVICE_URL`).

**What would a dynamic registry (e.g., HashiCorp Consul, Netflix Eureka, or Kubernetes DNS) add that a static config file cannot?**

| Capability                        | Static / Config-Based Discovery (Lab 7)                                     | Dynamic Service Discovery (Consul / Eureka / K8s)                                                                           |
| :-------------------------------- | :-------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **Service Registration**          | Manual configuration in `.env` / YAML prior to process boot.                | **Self-Registration**: Microservice instances auto-register upon startup with IP, hostname, and ephemeral port.           |
| **Elastic Auto-Scaling**          | Cannot handle dynamic replicas (requires manual URL list update & restart). | **Auto-Scaling Support**: Discovers and balances traffic across multiple running instances dynamically.                     |
| **Active Health Checking**        | Gateway detects failure only when actively forwarding requests.             | **Continuous Heartbeats**: Registry continuously monitors health and automatically deregisters unhealthy instances.        |
| **Zero-Downtime Reconfiguration** | Requires gateway reload/restart when endpoints change.                      | **Event-Driven Push/Pull**: Service instances appear/disappear in real time without restarting the Gateway.                 |
| **Infrastructure Overhead**       | Extremely lightweight; zero external infrastructure dependencies.           | Requires hosting, clustering, and managing dedicated registry servers (consensus protocols like Raft).                      |

**Conclusion**: While static configuration-based discovery is ideal for predictable containerized topologies with fixed service names (like Docker Compose bridge networks), dynamic discovery is essential in cloud-native environments characterized by autoscaling, ephemeral containers, and dynamic port allocation.

---

## 6. Service Discovery Layer (Part B)

### 6.1 Environment Variables

The gateway reads service addresses at boot time:

```bash
# Service Discovery Registry (Externalized Configuration)
USER_SERVICE_URL=http://user-service:3001
PRODUCT_SERVICE_URL=http://product-service:3002
ORDER_SERVICE_URL=http://order-service:3003
```

- In `api-gateway/server.js`, route definitions reference these variables rather than hard-coded URLs.
- When configuration changes, a restart of the gateway container is required for the new addresses to take effect.

### 6.2 Configuration-Change Demonstration

To demonstrate that service routing changes strictly through configuration without modifying application source code:

1. **Initial State**: Gateway configured with `PRODUCT_SERVICE_URL=http://localhost:3002`. Request to `GET /products` routes to port 3002 and succeeds.
2. **Reconfiguration**: Update `PRODUCT_SERVICE_URL=http://localhost:3999` in `.env`. (No code changed in `server.js`).
3. **Gateway Restart**: Restart gateway process.
4. **Verification**: Request to `GET /products` now targets port 3999. Since nothing is listening on 3999, the gateway returns `502 Bad Gateway` pointing to `http://localhost:3999`.
5. **Reversion**: Restore `PRODUCT_SERVICE_URL=http://localhost:3002`, restart, and confirm requests succeed.

*This exact sequence is verified automatically in the test suite `api-gateway/test/config-change.test.js`.*

---

## 7. Verification & Practical Testing (Part D)

### 7.1 Automated Test Suite Results

The automated test suite runs using Node.js native test runner:

```bash
npm --prefix api-gateway test
```

**Actual Execution Output:**

```
> api-gateway@1.0.0 test
> node --test test/**/*.test.js

▶ Part B: Configuration-Based Service Discovery Demonstration
  ✔ Proves gateway routes to a newly configured service URL upon restart with zero code change (403.88ms)
✔ Part B: Configuration-Based Service Discovery Demonstration (406.32ms)
▶ Lab 7 API Gateway & Service Discovery Test Suite
  ✔ 1. GET /health reports UP status and configured service registry without proxying (84.44ms)
  ✔ 2. GET /users/101?query=active forwards to User Service and preserves path & query (33.51ms)
  ✔ 3. POST /users forwards request method and JSON body (19.54ms)
  ✔ 4. GET /products forwards to Product Service (14.30ms)
  ✔ 5. GET /orders returns clear 502/503 error when Order Service is down without crashing (9.99ms)
  ✔ 6. GET /unregistered-route returns 404 Not Found with available endpoints (8.81ms)
  ✔ 7. Failure and Recovery: service stop returns 502, restart recovers to 200 (34.76ms)
✔ Lab 7 API Gateway & Service Discovery Test Suite (466.33ms)
ℹ tests 8
ℹ suites 2
ℹ pass 8
ℹ fail 0
```

---

### 7.2 Hands-On Failure and Recovery Test (Local Docker Verification)

The gateway failure test demonstrates centralized error handling when a backend microservice fails.

> **Verification Environment**: This failure and recovery test procedure was verified in the **local Docker Compose environment** using the Docker CLI to simulate unexpected microservice outages. *(The cloud deployment on Render was verified for live routing and healthy connectivity across all services without disrupting production cloud instances).*

The step-by-step verification procedure:

1. **Step 1 — Start All Services**:
   ```bash
   docker compose up -d
   ```
2. **Step 2 — Send Valid Request**:
   ```bash
   curl -i http://localhost:8000/users
   ```
   **Response**: `HTTP/1.1 200 OK` with JSON array of users.
3. **Step 3 — Stop User Service Only**:
   ```bash
   docker stop user-service
   ```
4. **Step 4 — Send Request Again**:
   ```bash
   curl -i http://localhost:8000/users
   ```
   **Response**: `HTTP/1.1 502 Bad Gateway`
   ```json
   {
     "error": "Bad Gateway",
     "message": "Target service is unreachable or unavailable",
     "targetService": "User Service",
     "targetUrl": "http://user-service:3001",
     "statusCode": 502,
     "details": "connect ECONNREFUSED",
     "timestamp": "2026-10-14T17:45:00.000Z"
   }
   ```
   *The gateway logs the error and remains running without crashing or hanging.*
5. **Step 5 — Restart User Service**:
   ```bash
   docker start user-service
   ```
6. **Step 6 — Verify Recovery**:
   ```bash
   curl -i http://localhost:8000/users
   ```
   **Response**: `HTTP/1.1 200 OK` — The gateway automatically recovers without needing a restart.

---

## 8. How to Run Locally via Docker Compose (Part C)

### 8.1 Setup Prerequisites

- Node.js v20+ and npm installed
- Docker Engine & Docker Compose installed

### 8.2 Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Configure your MongoDB Atlas connection strings in `.env`:
   ```env
   PORT=8000
   USER_SERVICE_URL=http://user-service:3001
   PRODUCT_SERVICE_URL=http://product-service:3002
   ORDER_SERVICE_URL=http://order-service:3003
   
   USER_SERVICE_MONGO_URI=mongodb+srv://<user>:<password>@cluster0.h3j48jw.mongodb.net/campus_user_db?retryWrites=true&w=majority
   PRODUCT_SERVICE_MONGO_URI=mongodb+srv://<user>:<password>@cluster0.h3j48jw.mongodb.net/campus_product_db?retryWrites=true&w=majority
   ORDER_SERVICE_MONGO_URI=mongodb+srv://<user>:<password>@cluster0.h3j48jw.mongodb.net/campus_order_db?retryWrites=true&w=majority
   ```

### 8.3 Docker Compose Commands

```bash
# Build and start all services
docker compose up --build -d

# Verify running containers and port bindings
docker compose ps

# View gateway centralized logs in real time
docker compose logs -f api-gateway

# Stop all containers
docker compose down
```

### 8.4 Port Exposure Verification

When running `docker compose ps`, only port `8000` is exposed to the host machine:
- `api-gateway` -> `0.0.0.0:8000->8000/tcp`
- `user-service` -> `3001/tcp` (Internal only)
- `product-service` -> `3002/tcp` (Internal only)
- `order-service` -> `3003/tcp` (Internal only)

## 9. Cloud Deployment on Render (Part E)

### 9.1 Render Blueprint & Deployment Metadata

The microservices architecture is containerized and deployed to the **Render Cloud Platform** using Render Blueprints (`render.yaml`):

- **Render Blueprint Name**: `campus-connect-lab7`
- **GitHub Repository**: [`https://github.com/varunee-it/campus-connect-microservices`](https://github.com/varunee-it/campus-connect-microservices)
- **Deployment Branch**: `main`
- **Public API Gateway URL**: [`https://campusconnect-api-gateway-xg0y.onrender.com`](https://campusconnect-api-gateway-xg0y.onrender.com)
- **Live Endpoint Links**:
  - `GET /health`: [`https://campusconnect-api-gateway-xg0y.onrender.com/health`](https://campusconnect-api-gateway-xg0y.onrender.com/health)
  - `GET /users`: [`https://campusconnect-api-gateway-xg0y.onrender.com/users`](https://campusconnect-api-gateway-xg0y.onrender.com/users)
  - `GET /products`: [`https://campusconnect-api-gateway-xg0y.onrender.com/products`](https://campusconnect-api-gateway-xg0y.onrender.com/products)
  - `GET /orders`: [`https://campusconnect-api-gateway-xg0y.onrender.com/orders`](https://campusconnect-api-gateway-xg0y.onrender.com/orders)

---

### 9.2 The Four Render Microservices & Gateway Routing Architecture

The cloud architecture consists of four distinct web services defined in `render.yaml`:

| Render Service Name | Service Type | Internal Port | Public URL / Internal Host | Role & Responsibilities |
| :------------------ | :----------- | :------------ | :-------------------------- | :---------------------- |
| **`campusconnect-api-gateway`** | Web Service (Docker) | `8000` | [`https://campusconnect-api-gateway-xg0y.onrender.com`](https://campusconnect-api-gateway-xg0y.onrender.com) | **Public Entry Point & Reverse Proxy**: Unified ingress for all external clients. Dispatches `/users/*`, `/products/*`, and `/orders/*` to backend microservices, tracks request latency, enforces structured logging, and returns standardized JSON `502 Bad Gateway` / `503 Service Unavailable` responses on backend failures. |
| **`campusconnect-user-service`** | Web Service (Docker) | `3001` | `https://campusconnect-user-service-03do.onrender.com` | **User Microservice**: Manages user profiles, student registrations, schemas, and queries against MongoDB Atlas (`campus_user_db`). |
| **`campusconnect-product-service`** | Web Service (Docker) | `3002` | `https://campusconnect-product-service-jodx.onrender.com` | **Product Microservice**: Manages the product catalog, stock inventory, prices, and queries against MongoDB Atlas (`campus_product_db`). |
| **`campusconnect-order-service`** | Web Service (Docker) | `3003` | `https://campusconnect-order-service-9a8u.onrender.com` | **Order Microservice**: Manages order creation and order lifecycle against MongoDB Atlas (`campus_order_db`). Performs synchronous HTTP verification against User Service and Product Service before completing an order. |

#### Service Discovery & Environment-Variable Routing

In Render, dynamic inter-service discovery is managed via environment variables:

1. In `render.yaml`, the gateway receives backend addresses using `fromService`:
   ```yaml
   envVars:
     - key: USER_SERVICE_URL
       fromService:
         type: web
         name: campusconnect-user-service
         property: host
     - key: PRODUCT_SERVICE_URL
       fromService:
         type: web
         name: campusconnect-product-service
         property: host
     - key: ORDER_SERVICE_URL
       fromService:
         type: web
         name: campusconnect-order-service
         property: host
   ```
2. Render injects service hostnames (e.g., `campusconnect-user-service-03do`).
3. The API Gateway (`api-gateway/server.js`) utilizes a built-in `formatUrl()` normalizer:
   - If an internal Render host slug is supplied, it is automatically formatted to `https://<host>.onrender.com`.
   - If a full URL or Docker hostname (`http://user-service:3001`) is supplied, it is preserved without modification.
4. This architecture achieves **true environment parity**: the exact same application code and Docker images run seamlessly in both local Docker Compose and Render Cloud.

---

### 9.3 Deployment Verification & Actual Live Evidence

All four endpoints on the live Render deployment were verified using HTTP requests.

#### 1. Live Gateway Health Check

Request:
```bash
curl.exe -s https://campusconnect-api-gateway-xg0y.onrender.com/health
```

Actual Response (`HTTP 200 OK`):
```json
{
  "service": "api-gateway",
  "status": "UP",
  "port": 8000,
  "timestamp": "2026-10-15T09:43:00.043Z",
  "serviceRegistry": {
    "userService": "https://campusconnect-user-service-03do.onrender.com",
    "productService": "https://campusconnect-product-service-jodx.onrender.com",
    "orderService": "https://campusconnect-order-service-9a8u.onrender.com"
  }
}
```

*Verification Finding*: The gateway is live, reports `status: "UP"`, and successfully displays the resolved cloud URLs for all three backend microservices in its active service registry.

#### 2. Live Microservice Routing Verification

```bash
# 1. User Service Route via Gateway
curl.exe -s https://campusconnect-api-gateway-xg0y.onrender.com/users
# Output: []

# 2. Product Service Route via Gateway
curl.exe -s https://campusconnect-api-gateway-xg0y.onrender.com/products
# Output: []

# 3. Order Service Route via Gateway
curl.exe -s https://campusconnect-api-gateway-xg0y.onrender.com/orders
# Output: []
```

#### Important Verification Notes:

- **Database State (`[]`)**: The empty JSON arrays (`[]`) returned by `/users`, `/products`, and `/orders` confirm that the API Gateway successfully proxied each request to the corresponding backend microservice, and each microservice successfully connected to its designated MongoDB Atlas database collection (`campus_user_db`, `campus_product_db`, `campus_order_db`) returning 0 records. This confirms complete end-to-end routing, container execution, and database connectivity. It does *not* claim that pre-existing database records or mutations were tested in the cloud.
- **Failure and Recovery Test Scope**: The failure-handling and automatic recovery test procedure (stopping a service to trigger `502 Bad Gateway` and restarting it to restore `200 OK`) was executed and verified **locally in Docker Compose** (documented in Section 7.2). It was *not* executed against the live Render cloud deployment to maintain production availability and avoid intentionally disrupting active cloud services.

---

## 10. Limitations and Cloud Notes

When interacting with the live Render cloud deployment, keep in mind the operational characteristics of Render Free Tier instances:

1. **Free-Tier Inactivity Spin-Down**: Render free web services spin down into a sleep state after 15 minutes of inactivity to preserve compute resources.
2. **Cold-Start Delay**: If services are dormant, the first incoming request triggers an automated spin-up cycle. The initial request may take **50–120 seconds** while the container initializes, boots Node.js, and establishes a secure TLS connection to MongoDB Atlas.
3. **Subsequent Low Latency**: Once awakened, the container remains warm, and subsequent requests execute with normal sub-100ms response times.
4. **Initial Database Collections**: Since the MongoDB Atlas databases were newly initialized for this deployment, GET collections return empty arrays (`[]`) until records are populated via POST requests.

---

## 11. Postman Collection & API Testing

The repository provides a complete, pre-configured Postman collection ready for import:

```
postman/Lab7_API_Gateway.postman_collection.json
```

### Environment Switching: Local vs. Cloud

The collection defines a parameterized `{{baseUrl}}` variable, allowing instant switching between environments:

| Environment | Variable Name | URL Value | Usage / Prerequisite |
| :---------- | :------------ | :-------- | :------------------- |
| **Local Environment** | `{{baseUrl}}` | `http://localhost:8000` | Requires `docker compose up -d` running locally. |
| **Public Cloud (Render)** | `{{baseUrl}}` | `https://campusconnect-api-gateway-xg0y.onrender.com` | Directly callable over the public internet. |

> **Note**: Microservice ports (`3001`, `3002`, `3003`) are internal only and cannot be accessed directly by clients. All requests must target the API Gateway (`8000` locally, or the public Render URL in the cloud).

### Included Requests & Assertions:

1. **`0. Gateway Health Check`**: `GET /health` — Asserts `200 OK`, `status === "UP"`, and service registry presence.
2. **`1. User Service Routes`**:
   - `GET /users`: List users (asserts `200 OK`).
   - `GET /users/:id`: Get single user (asserts `200 OK`).
   - `POST /users`: Create user (asserts `201 Created` with created user ID).
   - `PUT /users/:id`: Update user (asserts `200 OK`).
   - `DELETE /users/:id`: Delete user (asserts `200 OK`).
3. **`2. Product Service Routes`**:
   - `GET /products`: List products (asserts `200 OK`).
   - `GET /products/:id`: Get single product (asserts `200 OK`).
   - `POST /products`: Create product item (asserts `201 Created`).
   - `PUT /products/:id`: Update product item (asserts `200 OK`).
   - `DELETE /products/:id`: Delete product item (asserts `200 OK`).
4. **`3. Order Service Routes`**:
   - `GET /orders`: List orders (asserts `200 OK`).
   - `GET /orders/:id`: Get single order (asserts `200 OK`).
   - `POST /orders`: Place order with inter-service validation (asserts `201 Created`).
5. **`4. Resilience & Error Handling`**:
   - Service Unreachable Test: Asserts `502 Bad Gateway` or `503 Service Unavailable` with structured JSON error payload.
   - Service Recovery Test: Asserts `200 OK` after service restoration.

---

## 12. Security Best Practices

1. **Zero Committed Secrets**: `.env` is ignored by Git via `.gitignore`. Real credentials, database passwords, and connection strings are never committed to version control.
2. **Safe Placeholder Templates**: `.env.example` contains only sanitized dummy placeholders:
   ```env
   USER_SERVICE_MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/campus_user_db?retryWrites=true&w=majority
   PRODUCT_SERVICE_MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/campus_product_db?retryWrites=true&w=majority
   ORDER_SERVICE_MONGO_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/campus_order_db?retryWrites=true&w=majority
   ```
3. **Container Network Isolation**: In Docker Compose, microservice ports (`3001`, `3002`, `3003`) are declared using `expose` rather than `ports`. Only the API Gateway (`8000:8000`) is accessible from the host.
4. **Bounded Proxy Timeouts**: The gateway enforces bounded proxy timeouts (`PROXY_TIMEOUT_MS=5000`) to prevent client requests from hanging indefinitely if a backend service stalls.
5. **Sanitized Observability Logging**: Gateway request logging captures HTTP method, URL, status code, and latency, while suppressing sensitive authorization headers, bearer tokens, and credentials.

---

## 13. Written Reflection (Lab 6 vs. Lab 7)

Introducing the API Gateway and cloud deployment fundamentally transformed how the CampusConnect system operates compared to Lab 6. In Lab 6, clients acted as distributed orchestrators, juggling disparate port numbers, internal hostnames, and unhandled network drops. With Lab 7, clients interact solely through a unified ingress gateway that conceals internal topology, shields microservices inside a private network, and standardizes cross-cutting logging and 502/503 error handling. Furthermore, replacing hard-coded service URLs with configuration-based service discovery enables seamless promotion between local Docker environments and cloud hosting without modifying a single line of application source code.

---

## 14. Verification Screenshots & Evidence Checklist

The `Screenshots/` directory contains 13 verified image captures documenting the implementation, local execution, and cloud deployment:

| Screenshot | File Path | Verified Item |
| :--- | :--- | :--- |
| **01** | `Screenshots/01-lab6-services-running.png` | Lab 6 microservices running prior to gateway integration |
| **02** | `Screenshots/02-gateway-project-structure.png` | Complete project structure and gateway service directory |
| **03** | `Screenshots/03-gateway-dockerfile.png` | Dockerfile configuration for api-gateway |
| **04** | `Screenshots/04-compose-yaml-gateway.png` | `compose.yaml` showing only gateway port 8000 published |
| **05** | `Screenshots/05-docker-compose-up.png` | Docker containers running together on common bridge network |
| **06** | `Screenshots/06-gateway-health-check.png` | `GET /health` returning UP and active service registry |
| **07** | `Screenshots/07-postman-users-via-gateway.png` | User CRUD operations routed successfully through gateway |
| **08** | `Screenshots/08-postman-products-via-gateway.png` | Product CRUD operations routed successfully through gateway |
| **09** | `Screenshots/09-postman-orders-via-gateway.png` | Order operations and inter-service validation via gateway |
| **10** | `Screenshots/10-postman-502-unreachable.png` | Gateway 502 Bad Gateway response when backend is down |
| **11** | `Screenshots/11-service-discovery-config.png` | Configuration change demonstration without code changes |
| **12** | `Screenshots/12-cloud-deployment-dashboard.png` | Render Cloud deployment dashboard showing healthy services |
| **13** | `Screenshots/13-postman-cloud-tests.png` | Live Postman requests executing against public gateway URL |

---

# Web Services and SOA — Laboratory 8

## Kubernetes Orchestration, GitHub Actions CI/CD & Prometheus/Grafana Monitoring

**Primary Goal**: Operationalize the Lab 7 CampusConnect microservices application on Kubernetes (`lab8` namespace), automate test execution and versioned container image publishing via GitHub Actions CI/CD to GitHub Container Registry (GHCR), and establish real-time observability using Prometheus and Grafana.

---

### 15.1 System Architecture & Kubernetes Topology

The application preserves the microservices contracts established in Lab 6 and Lab 7. In Lab 8, the entire stack is orchestrated within the `lab8` Kubernetes namespace on Docker Desktop Kubernetes.

**Request Flow**:
```
Client / Postman
  │  (HTTP Host Port: 30080 or port-forward: 8000)
  ▼
API Gateway Service (NodePort: 30080 / Port: 8000)
  │
  ├──► /users/*    ──► User Service (ClusterIP: 3001)    ──► MongoDB Atlas (campus_user_db)
  ├──► /products/* ──► Product Service (ClusterIP: 3002) ──► MongoDB Atlas (campus_product_db)
  └──► /orders/*   ──► Order Service (ClusterIP: 3003)   ──► MongoDB Atlas (campus_order_db)
                             │
                             ├──► Inter-service verification: http://user-service:3001
                             └──► Inter-service verification: http://product-service:3002
```

#### Mermaid Architecture Diagram

```mermaid
flowchart TD
    Client["Client / Postman\n(Host NodePort: 30080 or Port-Forward: 8000)"]
    
    subgraph K8sCluster ["Kubernetes Cluster (Namespace: lab8)"]
        subgraph IngressLayer ["Ingress & Gateway Layer"]
            GatewaySvc["Service: api-gateway\n(Type: NodePort | Port: 8000 | NodePort: 30080)"]
            GatewayPod["Deployment: api-gateway (1 Replica)\n• Reverse Proxy & Routing\n• GET /health\n• GET /metrics (prom-client)"]
            GatewaySvc --> GatewayPod
        end

        subgraph CoreServices ["Backend Microservices (Internal ClusterIP Only)"]
            UserSvc["Service: user-service\n(Type: ClusterIP | Port: 3001)"]
            UserPods["Deployment: user-service\n(Replicas: 3 scaled for HA)"]
            UserSvc --> UserPods

            ProductSvc["Service: product-service\n(Type: ClusterIP | Port: 3002)"]
            ProductPods["Deployment: product-service\n(Replicas: 1)"]
            ProductSvc --> ProductPods

            OrderSvc["Service: order-service\n(Type: ClusterIP | Port: 3003)"]
            OrderPods["Deployment: order-service\n(Replicas: 1)"]
            OrderSvc --> OrderPods

            OrderPods -->|CoreDNS: http://user-service:3001| UserSvc
            OrderPods -->|CoreDNS: http://product-service:3002| ProductSvc
        end

        subgraph MonitoringLayer ["Observability Stack"]
            PromSvc["Service: prometheus\n(Type: NodePort | Port: 9090 | NodePort: 30090)"]
            PromPod["Deployment: prometheus\n• Scrapes api-gateway:8000/metrics every 5s"]
            PromSvc --> PromPod

            GrafSvc["Service: grafana\n(Type: NodePort | Port: 3000 | NodePort: 30030)"]
            GrafPod["Deployment: grafana\n• Datasource: http://prometheus:9090\n• Visual Dashboard"]
            GrafSvc --> GrafPod

            PromPod -.->|Scrape /metrics| GatewayPod
            GrafPod -.->|PromQL Queries| PromSvc
        end

        GatewayPod -->|/users/* via CoreDNS| UserSvc
        GatewayPod -->|/products/* via CoreDNS| ProductSvc
        GatewayPod -->|/orders/* via CoreDNS| OrderSvc

        ConfigMap["ConfigMap: campus-config\n(Ports, CoreDNS URLs, Timeouts)"]
        Secrets["Secret: campus-secrets\n(MongoDB Atlas URIs)"]
        ConfigMap -.-> GatewayPod
        ConfigMap -.-> UserPods
        ConfigMap -.-> ProductPods
        ConfigMap -.-> OrderPods
        Secrets -.-> UserPods
        Secrets -.-> ProductPods
        Secrets -.-> OrderPods
    end

    subgraph ExternalDB ["External Managed Database (Cloud)"]
        AtlasUserDB[("MongoDB Atlas:\ncampus_user_db")]
        AtlasProdDB[("MongoDB Atlas:\ncampus_product_db")]
        AtlasOrderDB[("MongoDB Atlas:\ncampus_order_db")]
    end

    Client -->|HTTP Ingress| GatewaySvc
    UserPods -->|TLS / Mongoose| AtlasUserDB
    ProductPods -->|TLS / Mongoose| AtlasProdDB
    OrderPods -->|TLS / Mongoose| AtlasOrderDB
```

---

### 15.2 Kubernetes Manifests & Configuration Architecture

All Kubernetes manifests are located in the [`k8s/`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s) directory and explicitly belong to `namespace: lab8`.

| Manifest File | Kubernetes Kind | Description | Ports / Probes |
| :--- | :--- | :--- | :--- |
| [`k8s/namespace.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/namespace.yaml) | `Namespace` | Defines the isolated `lab8` namespace | N/A |
| [`k8s/configmap.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/configmap.yaml) | `ConfigMap` | Non-sensitive configs (`GATEWAY_PORT: 8000`, `USER_PORT: 3001`, `PRODUCT_PORT: 3002`, `ORDER_PORT: 3003`, `USER_SERVICE_URL: http://user-service:3001`, `PRODUCT_SERVICE_URL: http://product-service:3002`, `ORDER_SERVICE_URL: http://order-service:3003`, `PROXY_TIMEOUT_MS: 5000`, `HTTP_TIMEOUT_MS: 3000`) | N/A |
| [`k8s/secret.yaml.example`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/secret.yaml.example) | `Secret` | Committed template with sanitized placeholders (`USER_SERVICE_MONGO_URI`, `PRODUCT_SERVICE_MONGO_URI`, `ORDER_SERVICE_MONGO_URI`) | N/A |
| `k8s/secret.yaml` | `Secret` | **Locally generated only** containing actual Atlas URIs. Strictly ignored by `.gitignore` and never committed to Git. | N/A |
| [`k8s/gateway-deployment.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/gateway-deployment.yaml) | `Deployment` | 1 replica of `api-gateway:v1`, pulls from ConfigMap, resource limits (250m CPU, 256Mi RAM) | Liveness & Readiness: `GET /health` on port `8000` |
| [`k8s/gateway-service.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/gateway-service.yaml) | `Service` | `NodePort` service exposing port `8000` on host port `30080` | Port: 8000, NodePort: 30080 |
| [`k8s/user-deployment.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/user-deployment.yaml) | `Deployment` | Scaled to 3 replicas of `user-service:v1`, MongoDB URI via `secretKeyRef` | Liveness & Readiness: `GET /health` on port `3001` |
| [`k8s/user-service.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/user-service.yaml) | `Service` | Internal `ClusterIP` on port `3001` | Port: 3001 |
| [`k8s/product-deployment.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/product-deployment.yaml) | `Deployment` | 1 replica of `product-service:v1`, MongoDB URI via `secretKeyRef` | Liveness & Readiness: `GET /health` on port `3002` |
| [`k8s/product-service.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/product-service.yaml) | `Service` | Internal `ClusterIP` on port `3002` | Port: 3002 |
| [`k8s/order-deployment.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/order-deployment.yaml) | `Deployment` | 1 replica of `order-service:v1`, configured with dependent service URLs | Liveness & Readiness: `GET /health` on port `3003` |
| [`k8s/order-service.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/order-service.yaml) | `Service` | Internal `ClusterIP` on port `3003` | Port: 3003 |
| [`k8s/prometheus.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/prometheus.yaml) | `Deployment` + `Svc` + `CM` | Prometheus v2.54.1 with ConfigMap scraping `api-gateway:8000/metrics` every 5s | Port: 9090, NodePort: 30090 |
| [`k8s/grafana.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/grafana.yaml) | `Deployment` + `Svc` + `CM` | Grafana 11.2.0 with auto-provisioned Prometheus datasource | Port: 3000, NodePort: 30030 |
| [`k8s/grafana-dashboard.json`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/grafana-dashboard.json) | JSON Asset | Pre-built dashboard JSON covering traffic rate, latency, and status codes | N/A |

> **Security Guardrail**: `k8s/secret.yaml` contains real credentials and is **strictly excluded** by Git (`.gitignore` rule: `k8s/secret.yaml`). Only [`k8s/secret.yaml.example`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/secret.yaml.example) is committed.

---

### 15.3 Kubernetes Setup & Cluster Operations

#### 1. Cluster Verification
```powershell
# Verify active context
kubectl config current-context
# Expected: docker-desktop

# Verify node availability
kubectl get nodes
# Output: desktop-control-plane   Ready   control-plane   v1.36.1
```

#### 2. Apply Manifests in Order
```powershell
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Apply non-sensitive configuration
kubectl apply -f k8s/configmap.yaml

# 3. Apply sensitive credentials (locally created from secret.yaml.example)
kubectl apply -f k8s/secret.yaml

# 4. Deploy internal microservices
kubectl apply -f k8s/user-service.yaml
kubectl apply -f k8s/user-deployment.yaml
kubectl apply -f k8s/product-service.yaml
kubectl apply -f k8s/product-deployment.yaml
kubectl apply -f k8s/order-service.yaml
kubectl apply -f k8s/order-deployment.yaml

# 5. Deploy API Gateway (Ingress)
kubectl apply -f k8s/gateway-service.yaml
kubectl apply -f k8s/gateway-deployment.yaml

# 6. Deploy Observability Stack
kubectl apply -f k8s/prometheus.yaml
kubectl apply -f k8s/grafana.yaml
```

#### 3. Inspect Running Resources
```powershell
kubectl get pods -n lab8
kubectl get deployments -n lab8
kubectl get services -n lab8
kubectl get endpoints -n lab8
```

**Verified Output**:
```
NAME                              READY   STATUS    RESTARTS   AGE
api-gateway-54645dc599-hk6wt      1/1     Running   0          69m
grafana-67589cc796-f2mbt          1/1     Running   0          69m
order-service-5946cb5d78-8gnsf    1/1     Running   0          69m
product-service-9fdc5f9b6-q6x9t   1/1     Running   0          69m
prometheus-6b4d4549d7-c4gwx       1/1     Running   0          69m
user-service-685675b8f7-4pzhq     1/1     Running   0          43m
user-service-685675b8f7-f582l     1/1     Running   0          69m
user-service-685675b8f7-m9dqg     1/1     Running   0          45m
```

#### 4. Accessing Services
- **API Gateway**:
  - NodePort: `http://localhost:30080` (Endpoints: `/health`, `/metrics`, `/users`, `/products`, `/orders`)
  - Port-Forward alternative: `kubectl port-forward -n lab8 service/api-gateway 8000:8000` -> `http://localhost:8000`
- **Prometheus UI**:
  - NodePort: `http://localhost:30090`
  - Port-Forward alternative: `kubectl port-forward -n lab8 service/prometheus 9090:9090` -> `http://localhost:9090`
- **Grafana UI**:
  - NodePort: `http://localhost:30030`
  - Port-Forward alternative: `kubectl port-forward -n lab8 service/grafana 3000:3000` -> `http://localhost:3000` (Credentials: `admin` / `admin`)

---

### 15.4 Scaling and Self-Healing Demonstrations

#### Demonstration 1: Scaling User Service to 3 Replicas
The User Service Deployment was scaled horizontally from 1 replica to 3 replicas:
```powershell
kubectl scale deployment user-service --replicas=3 -n lab8
kubectl get deployment user-service -n lab8
```
**Verified Result**:
```
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
user-service   3/3     3            3           69m
```
All 3 pods (`user-service-685675b8f7-4pzhq`, `user-service-685675b8f7-f582l`, `user-service-685675b8f7-m9dqg`) reached `1/1 Ready` and `Running` status, and the `user-service` ClusterIP service endpoints automatically balanced traffic across all 3 pod IP addresses.

#### Demonstration 2: Self-Healing Pod Replacement
To demonstrate Kubernetes self-healing resilience:
```powershell
# 1. Delete an active User Service Pod
kubectl delete pod user-service-685675b8f7-kslww -n lab8

# 2. Watch Kubernetes ReplicaSet automatically trigger replacement
kubectl get pods -n lab8 -w
```
**Verified Result**:
The deleted pod was terminated, and within 43 seconds, the Kubernetes ReplicaSet detected the mismatch in desired state (3 desired, 2 current) and provisioned replacement pod `user-service-685675b8f7-4pzhq`, which passed readiness checks and reached `1/1 Running`.

---

### 15.5 GitHub Actions CI/CD Pipeline

The repository includes an automated pipeline in [`.github/workflows/ci-cd.yml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/.github/workflows/ci-cd.yml) triggered on `push` and `pull_request` to `main`:

```
Git Push to main (e.g., Commit 14fc704)
  │
  ├──► Stage 1: Run Automated Tests
  │       • Ubuntu runner, Node.js 22 runtime
  │       • Runs native test runner: npm ci && npm test in api-gateway
  │       • Asserts all 9 unit and regression tests pass (including /metrics test)
  │
  ├──► Stage 2: Build & Publish Container Images
  │       • Matrix build for all 4 microservices:
  │         - api-gateway
  │         - user-service
  │         - product-service
  │         - order-service
  │       • Authenticates securely to GitHub Container Registry (ghcr.io) via GITHUB_TOKEN
  │       • Tags versioned images with the exact Git commit SHA and latest:
  │         - ghcr.io/varunee-it/api-gateway:14fc704...
  │         - ghcr.io/varunee-it/user-service:14fc704...
  │         - ghcr.io/varunee-it/product-service:14fc704...
  │         - ghcr.io/varunee-it/order-service:14fc704...
  │
  └──► Stage 3: Deploy to Kubernetes Cluster (Guarded)
          • Condition: Requires secret KUBECONFIG_DATA
          • If KUBECONFIG_DATA is unset: Logs an informative notice and cleanly completes without failing.
          • If KUBECONFIG_DATA is present: Configures kubeconfig, applies manifests, and checks rollout status.
```

#### Verified Evidence for Commit `14fc704`
The GitHub Actions run for commit `14fc704` (`feat: add Kubernetes CI/CD and monitoring for Lab 8`) completed with status **Success** in 1m 9s:
- **Run Automated Tests**: Passed in 8s.
- **Build & Publish**: Successfully published all 4 container images to GitHub Packages (GHCR).
- **Deploy Step**: Evaluated guard conditions cleanly.

> **Operational Note**: The pipeline verification documented here reflects the run for commit `14fc704`. Future pipeline runs depend on repository secrets and target cluster availability.

---

### 15.6 Prometheus & Grafana Monitoring

#### Prometheus Configuration
The API Gateway was instrumented with `prom-client` in [`api-gateway/server.js`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/api-gateway/server.js), exposing standard Prometheus metrics at `GET /metrics`.

Prometheus is configured in [`k8s/prometheus.yaml`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/k8s/prometheus.yaml) with a 5-second scrape interval:
```yaml
scrape_configs:
  - job_name: "api-gateway"
    metrics_path: "/metrics"
    static_configs:
      - targets: ["api-gateway:8000"]
        labels:
          service: "api-gateway"
          app: "campus-connect"
```

**Target Verification**:
Navigating to `http://localhost:9090/targets` (or `http://localhost:30090/targets`) confirms both scrape targets reporting state **`UP`**:
- `api-gateway (1/1 up)`: `http://api-gateway:8000/metrics`
- `prometheus (1/1 up)`: `http://localhost:9090/metrics`

#### Supported PromQL Queries
The following queries run directly against the live Prometheus server:

| Monitoring Question | Supported PromQL Expression | Metric Sourced From Gateway |
| :--- | :--- | :--- |
| **Target Availability** | `up{job="api-gateway"}` | Returns `1` when the gateway `/metrics` scrape succeeds |
| **Request Rate (Total)** | `sum(rate(http_requests_total[5m]))` | Measures overall HTTP requests per second |
| **Request Rate by Route** | `sum(rate(http_requests_total[1m])) by (route)` | Ingress request rate broken down by `/users`, `/products`, `/orders`, `/health` |
| **HTTP Error Rate** | `sum(rate(http_requests_total{status_code=~"5.."}[5m]))` | Frequency of 5xx server/gateway errors |
| **Status Code Distribution** | `sum(http_requests_total) by (status_code)` | Total request counts broken down by HTTP status (`200`, `201`, `404`, `502`) |
| **Average Request Latency** | `sum(rate(http_request_duration_seconds_sum[5m])) / sum(rate(http_request_duration_seconds_count[5m]))` | Average duration per HTTP transaction in seconds |
| **95th Percentile Latency** | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))` | 95th percentile response latency |

#### Grafana Dashboard & Real-World Limitations
- **Datasource**: Pre-provisioned to connect automatically to `http://prometheus:9090`.
- **Verified Panels**: The `API Requests per Second` panel (`sum(rate(http_requests_total[5m]))`) actively charts live ingress traffic and shows real-time traffic spikes.
- **Honest Dashboard Limitations**:
  - **Error Panels Showing `No data`**: If no 5xx errors have occurred during the selected time window, PromQL queries filtering on `{status_code=~"5.."}` legitimately return empty series (`No data`). This is normal and indicates healthy operations rather than a faulty panel.
  - **Short-Window Rate Panels**: If queries use narrow rate intervals (e.g., `rate(...[1m])`) during idle periods without active client traffic, panels may temporarily read `No data` until traffic is resumed.

---

### 15.7 Evidence Screenshots & Deliverables Mapping

The [`Screenshots/`](file:///d:/DAU%20Material/Sem-3/JayPrakash%20Lalchandani/Lab/Lab-8-varunee/Screenshots) directory contains verified evidence captures documenting Lab 8 implementation, scaling, self-healing, CI/CD, and monitoring.

#### Evidence Table (Verified Existing Files)

| Item # | Screenshot File | Description & Verified State |
| :--- | :--- | :--- |
| **01** | [`1-github-actions-success.png`](Screenshots/1-github-actions-success.png) | GitHub Actions CI/CD run #1 for commit `14fc704` succeeded (automated tests passed, 4 docker images built and pushed, deploy job checked). |
| **02** | [`2-github-packages.png`](Screenshots/2-github-packages.png) | GitHub Packages (GHCR) package registry showing all 4 published images (`api-gateway`, `user-service`, `product-service`, `order-service`). |
| **03** | [`3-prometheus-targets-up.png`](Screenshots/3-prometheus-targets-up.png) | Prometheus Targets page (`localhost:9090/targets`) displaying `api-gateway (1/1 up)` scraping `http://api-gateway:8000/metrics` and `prometheus (1/1 up)`. |
| **04** | [`4-grafana-dashboard.png`](Screenshots/4-grafana-dashboard.png) | Grafana Dashboard UI (`localhost:3000`) displaying `API Requests per Second` panel (`sum(rate(http_requests_total[5m]))`) charting traffic. |
| **05** | [`5-prometheus-targets.png`](Screenshots/5-prometheus-targets.png) | PowerShell terminal output showing `kubectl get pods -n lab8` (8 pods Running) and `kubectl get deployment user-service -n lab8` (3/3 replicas Ready and Available). |
| **06** | [`6-kubernetes-self-healing.png`](Screenshots/6-kubernetes-self-healing.png) | PowerShell terminal output demonstrating self-healing: deleting pod `user-service-685675b8f7-kslww` and observing automatic replacement pod provisioned by ReplicaSet. |

#### Visual Evidence Gallery

##### 1. GitHub Actions CI/CD Pipeline Success (Commit `14fc704`)
![GitHub Actions Success](Screenshots/1-github-actions-success.png)

##### 2. Versioned Images Published to GitHub Container Registry (GHCR)
![GitHub Packages](Screenshots/2-github-packages.png)

##### 3. Prometheus Targets Reporting UP State
![Prometheus Targets UP](Screenshots/3-prometheus-targets-up.png)

##### 4. Grafana Visual Dashboard Tracking Ingress Request Rate
![Grafana Dashboard](Screenshots/4-grafana-dashboard.png)

##### 5. Kubernetes Pods & User Service Scaling (3/3 Ready)
![Kubernetes Scaling](Screenshots/5-prometheus-targets.png)

##### 6. Kubernetes Self-Healing Pod Replacement
![Kubernetes Self-Healing](Screenshots/6-kubernetes-self-healing.png)

#### Missing Evidence & Discrepancies Checklist
To maintain strict academic honesty, the following items are noted:
- **`lab8-kubernetes-scaling.png`**: Not a separate file on disk; scaling evidence is captured within `5-prometheus-targets.png` showing `user-service 3/3`.
- **Postman through NodePort `30080`**: Postman requests verified gateway ingress, but a dedicated screenshot for NodePort `30080` can be captured if required by your evaluator.

---

### 15.8 Troubleshooting & Operational Playbook

| Problem / Symptom | Root Cause | Exact Solution |
| :--- | :--- | :--- |
| **Pod Status: `Pending` or `CrashLoopBackOff`** | Liveness/readiness probe failure or missing MongoDB credentials | 1. Run `kubectl describe pod <pod-name> -n lab8` to inspect probe failure reasons.<br>2. Run `kubectl logs <pod-name> -n lab8` to check database connection logs.<br>3. Verify that `k8s/secret.yaml` was applied and contains valid Atlas connection strings. |
| **`ErrImagePull` or `ImagePullBackOff`** | Kubernetes cannot find local image or lacks registry credentials | 1. Ensure `imagePullPolicy: IfNotPresent` is set in the Deployment manifest.<br>2. If using local Docker Desktop, ensure the image exists locally via `docker images`.<br>3. If using GHCR, configure `imagePullSecrets` with a valid GitHub Personal Access Token. |
| **`502 Bad Gateway` from API Gateway** | Target backend microservice is stopped, restarting, or misconfigured | 1. Check if the target service is running: `kubectl get pods -l app=user-service -n lab8`.<br>2. Verify service endpoints: `kubectl get endpoints user-service -n lab8`.<br>3. Verify ConfigMap URLs: `kubectl get configmap campus-config -n lab8 -o yaml` (must point to `http://<service-name>:<port>`). |
| **Prometheus Target Status: `DOWN`** | Prometheus cannot reach the target pod on port 8000 | 1. Verify `api-gateway` pod is Ready: `kubectl get pods -l app=api-gateway -n lab8`.<br>2. Check `api-gateway` service: `kubectl get svc api-gateway -n lab8`.<br>3. Confirm `/metrics` endpoint responds: test via `curl http://localhost:30080/metrics`. |
| **Grafana Panels Show `No data`** | No traffic during the selected time window, or query filtering on non-existent errors | 1. Change the time range in the top-right corner to `Last 15 minutes` or `Last 1 hour`.<br>2. Send API requests through the gateway (`curl http://localhost:30080/users`) to generate traffic.<br>3. Coalesce error queries with `or vector(0)` (e.g., `sum(http_requests_total{status_code=~"5.."}) or vector(0)`). |
| **Missing `k8s/secret.yaml` on New Clones** | Sensitive secret file is git-ignored to prevent credential leaks | 1. Copy template: `cp k8s/secret.yaml.example k8s/secret.yaml`.<br>2. Fill in real Atlas URIs for User, Product, and Order databases.<br>3. Apply: `kubectl apply -f k8s/secret.yaml -n lab8`. |
