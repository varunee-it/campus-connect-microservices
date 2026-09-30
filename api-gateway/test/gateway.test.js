const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Set environment variables before requiring the gateway app
process.env.PORT = '8099';
process.env.PROXY_TIMEOUT_MS = '2000';

let mockUserServer;
let mockProductServer;
let mockUserPort;
let mockProductPort;
let gatewayServer;
let gatewayUrl;

describe('Lab 7 API Gateway & Service Discovery Test Suite', () => {
    before(async () => {
        // 1. Start mock User Service
        mockUserServer = http.createServer((req, res) => {
            if (req.url.startsWith('/users')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', () => {
                        res.end(JSON.stringify({ message: 'User created', received: JSON.parse(body || '{}') }));
                    });
                    return;
                }
                res.end(JSON.stringify({
                    service: 'mock-user-service',
                    method: req.method,
                    url: req.url,
                    users: [{ id: '101', name: 'Varunee Agrawal', email: 'varunee@dau.ac.in' }]
                }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        await new Promise(resolve => mockUserServer.listen(0, resolve));
        mockUserPort = mockUserServer.address().port;

        // 2. Start mock Product Service
        mockProductServer = http.createServer((req, res) => {
            if (req.url.startsWith('/products')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    service: 'mock-product-service',
                    method: req.method,
                    url: req.url,
                    products: [{ id: '501', name: 'Cloud Computing Guide', price: 450 }]
                }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        await new Promise(resolve => mockProductServer.listen(0, resolve));
        mockProductPort = mockProductServer.address().port;

        // 3. Configure service URLs dynamically (Service Discovery via Environment)
        process.env.USER_SERVICE_URL = `http://localhost:${mockUserPort}`;
        process.env.PRODUCT_SERVICE_URL = `http://localhost:${mockProductPort}`;
        // Point Order Service to an unreachable port to test 502 error handling
        process.env.ORDER_SERVICE_URL = 'http://127.0.0.1:59999';

        // Load Gateway
        const app = require('../server');
        gatewayServer = http.createServer(app);
        await new Promise(resolve => gatewayServer.listen(0, resolve));
        const gatewayPort = gatewayServer.address().port;
        gatewayUrl = `http://localhost:${gatewayPort}`;
    });

    after(async () => {
        if (gatewayServer) await new Promise(r => gatewayServer.close(r));
        if (mockUserServer) await new Promise(r => mockUserServer.close(r));
        if (mockProductServer) await new Promise(r => mockProductServer.close(r));
    });

    // Test 1: GET /health
    test('1. GET /health reports UP status and configured service registry without proxying', async () => {
        const res = await fetch(`${gatewayUrl}/health`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.service, 'api-gateway');
        assert.equal(data.status, 'UP');
        assert.ok(data.timestamp);
        assert.ok(data.serviceRegistry);
        assert.equal(data.serviceRegistry.userService, `http://localhost:${mockUserPort}`);
        assert.equal(data.serviceRegistry.productService, `http://localhost:${mockProductPort}`);
    });

    // Test 2: Routing /users and preserving query string
    test('2. GET /users/101?query=active forwards to User Service and preserves path & query', async () => {
        const res = await fetch(`${gatewayUrl}/users/101?query=active`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.service, 'mock-user-service');
        assert.equal(data.method, 'GET');
        assert.equal(data.url, '/users/101?query=active');
        assert.equal(data.users[0].id, '101');
    });

    // Test 3: POST /users preserving request body
    test('3. POST /users forwards request method and JSON body', async () => {
        const payload = { name: 'New Student', email: 'student@dau.ac.in', semester: 3 };
        const res = await fetch(`${gatewayUrl}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, 'User created');
        assert.equal(data.received.name, 'New Student');
    });

    // Test 4: Routing /products
    test('4. GET /products forwards to Product Service', async () => {
        const res = await fetch(`${gatewayUrl}/products/501`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.service, 'mock-product-service');
        assert.equal(data.products[0].code || data.products[0].id, '501');
    });

    // Test 5: Centralized error handling when backend service is unreachable (502/503)
    test('5. GET /orders returns clear 502/503 error when Order Service is down without crashing', async () => {
        const res = await fetch(`${gatewayUrl}/orders`);
        assert.ok([502, 503].includes(res.status), `Expected 502 or 503, got ${res.status}`);
        const data = await res.json();
        assert.ok(data.error === 'Bad Gateway' || data.error === 'Service Unavailable');
        assert.equal(data.targetService, 'Order Service');
        assert.ok(data.message);
        assert.ok(data.details);
    });

    // Test 6: 404 for unregistered routes
    test('6. GET /unregistered-route returns 404 Not Found with available endpoints', async () => {
        const res = await fetch(`${gatewayUrl}/unknown-endpoint`);
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.equal(data.error, 'Not Found');
        assert.ok(Array.isArray(data.availableEndpoints));
    });

    // Test 7: Failure and Recovery sequence
    test('7. Failure and Recovery: service stop returns 502, restart recovers to 200', async () => {
        // Step A: Call /users - normal 200
        const initialRes = await fetch(`${gatewayUrl}/users`);
        assert.equal(initialRes.status, 200);

        // Step B: Stop mock User Service
        await new Promise(r => mockUserServer.close(r));

        // Step C: Call /users - should return 502 Bad Gateway
        const failedRes = await fetch(`${gatewayUrl}/users`);
        assert.ok([502, 503].includes(failedRes.status), `Expected 502 or 503, got ${failedRes.status}`);
        const failedData = await failedRes.json();
        assert.equal(failedData.targetService, 'User Service');

        // Step D: Restart mock User Service on same port
        mockUserServer = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'recovered', message: 'User service back online' }));
        });
        await new Promise(resolve => mockUserServer.listen(mockUserPort, resolve));

        // Step E: Retry /users - should recover to 200 OK
        const recoveredRes = await fetch(`${gatewayUrl}/users`);
        assert.equal(recoveredRes.status, 200);
        const recoveredData = await recoveredRes.json();
        assert.equal(recoveredData.status, 'recovered');
    });
});
