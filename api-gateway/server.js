const path = require('path');
require('dotenv').config({ 
    path: [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')] 
});

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, fixRequestBody } = require('http-proxy-middleware');

const app = express();

// ==========================================
// Part B: Configuration-Based Service Discovery Layer
// Externalize service locations into environment variables
// ==========================================
const formatUrl = (url) => {
    if (!url) return url;
    let clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
        if (!clean.includes('.') && !clean.includes(':')) {
            return `https://${clean}.onrender.com`;
        }
        return `http://${clean}`;
    }
    try {
        const parsed = new URL(clean);
        if (!parsed.hostname.includes('.') && !parsed.port && parsed.hostname !== 'localhost') {
            parsed.hostname = `${parsed.hostname}.onrender.com`;
            parsed.protocol = 'https:';
            return parsed.toString().replace(/\/$/, '');
        }
    } catch (e) {}
    return clean;
};

const PORT = process.env.PORT || 8000;
const USER_SERVICE_URL = formatUrl(process.env.USER_SERVICE_URL || 'http://localhost:3001');
const PRODUCT_SERVICE_URL = formatUrl(process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002');
const ORDER_SERVICE_URL = formatUrl(process.env.ORDER_SERVICE_URL || 'http://localhost:3003');
const PROXY_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS || '5000', 10);

const validateServiceConfig = () => {
    console.log('[GATEWAY REGISTRY] Validating Service Discovery Configuration:');
    const services = [
        { name: 'USER_SERVICE_URL', url: USER_SERVICE_URL, raw: process.env.USER_SERVICE_URL },
        { name: 'PRODUCT_SERVICE_URL', url: PRODUCT_SERVICE_URL, raw: process.env.PRODUCT_SERVICE_URL },
        { name: 'ORDER_SERVICE_URL', url: ORDER_SERVICE_URL, raw: process.env.ORDER_SERVICE_URL }
    ];
    for (const s of services) {
        if (!s.raw) {
            console.warn(`  [NOTICE] ${s.name} not explicitly set in environment, using default: ${s.url}`);
        } else {
            console.log(`  [CONFIGURED] ${s.name} -> ${s.url}`);
        }
    }
};

// Global CORS Middleware (Configurable for web/browser clients)
app.use(cors());

// Request timestamp tracking for latency calculation
app.use((req, res, next) => {
    req._startTime = Date.now();
    next();
});

// ==========================================
// Part A: Gateway Health Check (Handled locally, no proxying)
// ==========================================
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'api-gateway',
        status: 'UP',
        port: Number(PORT),
        timestamp: new Date().toISOString(),
        serviceRegistry: {
            userService: USER_SERVICE_URL,
            productService: PRODUCT_SERVICE_URL,
            orderService: ORDER_SERVICE_URL
        }
    });
});

// ==========================================
// Reusable Proxy Factory with Logging & Centralized Error Handling
// ==========================================
const createServiceProxy = (serviceName, targetUrl) => {
    return createProxyMiddleware({
        target: targetUrl,
        changeOrigin: true,
        proxyTimeout: PROXY_TIMEOUT_MS,
        // Preserve full incoming request URL (including query string) to backend service
        pathRewrite: (p, req) => req.originalUrl,
        on: {
            proxyReq: (proxyReq, req, res) => {
                req._targetService = serviceName;
                req._targetUrl = targetUrl;
                if (req.body && Object.keys(req.body).length > 0) {
                    fixRequestBody(proxyReq, req);
                }
            },
            proxyRes: (proxyRes, req, res) => {
                const duration = req._startTime ? Date.now() - req._startTime : 0;
                console.log(
                    `[GATEWAY LOG] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} ` +
                    `-> ${serviceName} (${targetUrl}) | Status: ${proxyRes.statusCode} | Duration: ${duration}ms`
                );
            },
            error: (err, req, res) => {
                const duration = req._startTime ? Date.now() - req._startTime : 0;
                const isTimeout = err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT' || err.code === 'ECONNRESET';
                const statusCode = isTimeout ? 503 : 502;
                const errorName = isTimeout ? 'Service Unavailable' : 'Bad Gateway';

                console.error(
                    `[GATEWAY ERROR] ${new Date().toISOString()} | ${req.method} ${req.originalUrl} ` +
                    `-> ${serviceName} (${targetUrl}) | ${errorName} (${statusCode}): ${err.message} | Duration: ${duration}ms`
                );

                if (res && !res.headersSent && !res.writableEnded) {
                    const responseBody = JSON.stringify({
                        error: errorName,
                        message: 'Target service is unreachable or unavailable',
                        targetService: serviceName,
                        targetUrl: targetUrl,
                        statusCode: statusCode,
                        details: err.message,
                        timestamp: new Date().toISOString()
                    });

                    if (typeof res.writeHead === 'function') {
                        res.writeHead(statusCode, {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(responseBody)
                        });
                        res.end(responseBody);
                    } else if (typeof res.status === 'function') {
                        res.status(statusCode).json(JSON.parse(responseBody));
                    }
                }
            }
        }
    });
};

// ==========================================
// Part A: Route Definitions (Configuration-Driven)
// ==========================================
// Route incoming paths to the correct backend microservices
app.use('/users', createServiceProxy('User Service', USER_SERVICE_URL));
app.use('/students', createServiceProxy('User Service', USER_SERVICE_URL));
app.use('/products', createServiceProxy('Product Service', PRODUCT_SERVICE_URL));
app.use('/orders', createServiceProxy('Order Service', ORDER_SERVICE_URL));

// Fallback 404 handler for routes not registered on the Gateway
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} is not registered on this API Gateway`,
        availableEndpoints: [
            'GET /health',
            '/users (GET, POST, /users/{id}: GET, PUT, DELETE)',
            '/products (GET, POST, /products/{id}: GET, PUT, DELETE)',
            '/orders (GET, POST, /orders/{id}: GET)'
        ]
    });
});

module.exports = app;

// Start Gateway Server if executed directly
if (require.main === module) {
    validateServiceConfig();
    app.listen(PORT, () => {
        console.log('='.repeat(65));
        console.log(`  CAMPUSCONNECT API GATEWAY (LAB 7)`);
        console.log('='.repeat(65));
        console.log(`  Gateway running on port:        ${PORT}`);
        console.log(`  Health Check URL:               http://localhost:${PORT}/health`);
        console.log(`  Configuration Service Registry:`);
        console.log(`    - User Service:               ${USER_SERVICE_URL}`);
        console.log(`    - Product Service:            ${PRODUCT_SERVICE_URL}`);
        console.log(`    - Order Service:              ${ORDER_SERVICE_URL}`);
        console.log('='.repeat(65));
    });
}
