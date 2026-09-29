const path = require('path');
require('dotenv').config({ path: [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')] });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const axios = require('axios');
const Order = require('./models/Order');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGO_URI || process.env.ORDER_SERVICE_MONGO_URI;

if (!mongoUri) {
    console.error('[Order Service] ERROR: MONGO_URI or ORDER_SERVICE_MONGO_URI environment variable is missing.');
} else {
    mongoose.connect(mongoUri)
        .then(() => console.log(`[Order Service] Connected to MongoDB at: ${mongoUri.replace(/:[^:@]+@/, ':****@')}`))
        .catch(err => console.error('[Order Service] MongoDB connection error:', err));
}

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

// Dependent Microservice URLs
// Defaults to localhost for host development; Docker Compose sets http://user-service:3001
const USER_SERVICE_URL = formatUrl(process.env.USER_SERVICE_URL || 'http://localhost:3001');
const PRODUCT_SERVICE_URL = formatUrl(process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002');
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS || '3000', 10);

console.log(`[Order Service] Configured target services:`);
console.log(`  - USER_SERVICE_URL: ${USER_SERVICE_URL}`);
console.log(`  - PRODUCT_SERVICE_URL: ${PRODUCT_SERVICE_URL}`);

// Health Check
const PORT = process.env.PORT || process.env.ORDER_SERVICE_PORT || 3003;

app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'order-service',
        status: 'UP',
        port: PORT,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        targetServices: {
            userService: USER_SERVICE_URL,
            productService: PRODUCT_SERVICE_URL
        },
        timestamp: new Date().toISOString()
    });
});

// GET /orders - List all orders
app.get('/orders', async (req, res) => {
    try {
        const orders = await Order.find({});
        res.status(200).json(orders);
    } catch (error) {
        console.error('[Order Service] Error fetching orders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /orders/:id - Get order by ID
app.get('/orders/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Order not found' });
        }
        console.error('[Order Service] Error fetching order by ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /orders - Create order with inter-service verification
app.post('/orders', async (req, res) => {
    const { userId, productId, quantity = 1 } = req.body;

    // Validate payload
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        return res.status(400).json({ error: 'Invalid or missing userId' });
    }
    if (!productId || typeof productId !== 'string' || productId.trim() === '') {
        return res.status(400).json({ error: 'Invalid or missing productId' });
    }
    if (typeof quantity !== 'number' || quantity < 1) {
        return res.status(400).json({ error: 'Quantity must be a positive number' });
    }

    // Step 1: Inter-service call to User Service
    let userData;
    try {
        console.log(`[Order Service] Verifying user ${userId} at ${USER_SERVICE_URL}/users/${userId}...`);
        const userResponse = await axios.get(`${USER_SERVICE_URL}/users/${userId}`, {
            timeout: HTTP_TIMEOUT_MS
        });
        userData = userResponse.data;
        console.log(`[Order Service] User verified: ${userData.name} (${userData.email})`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({
                error: 'Not Found',
                message: `User with ID ${userId} not found`,
                targetService: 'user-service'
            });
        }
        // Controlled 503 error when User Service is unavailable/offline
        console.error(`[Order Service] User Service unavailable: ${error.message}`);
        return res.status(503).json({
            error: 'Service Unavailable',
            message: 'User Service is currently unavailable. Please try again later.',
            targetService: 'user-service'
        });
    }

    // Step 2: Inter-service call to Product Service
    let productData;
    try {
        console.log(`[Order Service] Verifying product ${productId} at ${PRODUCT_SERVICE_URL}/products/${productId}...`);
        const productResponse = await axios.get(`${PRODUCT_SERVICE_URL}/products/${productId}`, {
            timeout: HTTP_TIMEOUT_MS
        });
        productData = productResponse.data;
        console.log(`[Order Service] Product verified: ${productData.name} ($${productData.price})`);
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return res.status(404).json({
                error: 'Not Found',
                message: `Product with ID ${productId} not found`,
                targetService: 'product-service'
            });
        }
        // Controlled 503 error when Product Service is unavailable/offline
        console.error(`[Order Service] Product Service unavailable: ${error.message}`);
        return res.status(503).json({
            error: 'Service Unavailable',
            message: 'Product Service is currently unavailable. Please try again later.',
            targetService: 'product-service'
        });
    }

    // Step 3: Compute total and persist order in Order DB
    try {
        const totalPrice = (productData.price || 0) * quantity;
        const newOrder = new Order({
            userId,
            productId,
            quantity,
            totalPrice,
            status: 'CONFIRMED'
        });

        const savedOrder = await newOrder.save();
        console.log(`[Order Service] Order created successfully: ${savedOrder.id}`);

        res.status(201).json({
            ...savedOrder.toJSON(),
            user: {
                id: userData.id || userData._id,
                name: userData.name,
                email: userData.email
            },
            product: {
                id: productData.id || productData._id,
                name: productData.name,
                price: productData.price,
                code: productData.code
            }
        });
    } catch (error) {
        console.error('[Order Service] Error saving order:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Order Service running on port ${PORT}`);
});
