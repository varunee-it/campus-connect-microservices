const path = require('path');
require('dotenv').config({ path: [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')] });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Product = require('./models/Product');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGO_URI || process.env.PRODUCT_SERVICE_MONGO_URI;

if (!mongoUri) {
    console.error('[Product Service] ERROR: MONGO_URI or PRODUCT_SERVICE_MONGO_URI environment variable is missing.');
} else {
    mongoose.connect(mongoUri)
        .then(() => console.log(`[Product Service] Connected to MongoDB at: ${mongoUri.replace(/:[^:@]+@/, ':****@')}`))
        .catch(err => console.error('[Product Service] MongoDB connection error:', err));
}

// Helper for basic validation
const validateProduct = (data, isPatch = false) => {
    const { name, code, category, price, stock } = data;
    if (!isPatch || name !== undefined) {
        if (!name || typeof name !== 'string' || name.trim() === '') return 'Invalid or missing name';
    }
    if (!isPatch || code !== undefined) {
        if (!code || typeof code !== 'string' || code.trim() === '') return 'Invalid or missing code';
    }
    if (!isPatch || category !== undefined) {
        if (!category || typeof category !== 'string' || category.trim() === '') return 'Invalid or missing category';
    }
    if (!isPatch || price !== undefined) {
        if (price === undefined || typeof price !== 'number' || price < 0) return 'Invalid or missing price';
    }
    if (stock !== undefined) {
        if (typeof stock !== 'number' || stock < 0) return 'Invalid stock value';
    }
    return null;
};

// Health Check
const PORT = process.env.PORT || process.env.PRODUCT_SERVICE_PORT || 3002;

app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'product-service',
        status: 'UP',
        port: PORT,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// GET /products - List all products
app.get('/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.status(200).json(products);
    } catch (error) {
        console.error('[Product Service] Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /products/:id - Get product by ID
app.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(product);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Product not found' });
        }
        console.error('[Product Service] Error fetching product by ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /products - Create a new product
app.post('/products', async (req, res) => {
    const errorMsg = validateProduct(req.body);
    if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
    }

    try {
        const { name, code, category, price, stock } = req.body;
        const newProduct = new Product({ name, code, category, price, stock });
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Product code already exists' });
        }
        console.error('[Product Service] Error creating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /products/:id - Update an existing product
app.put('/products/:id', async (req, res) => {
    const errorMsg = validateProduct(req.body);
    if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
    }

    try {
        const { name, code, category, price, stock } = req.body;
        const updatedProduct = await Product.findByIdAndUpdate(
            req.params.id,
            { name, code, category, price, stock },
            { new: true, runValidators: true }
        );

        if (!updatedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(200).json(updatedProduct);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Product not found' });
        }
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Product code already exists' });
        }
        console.error('[Product Service] Error updating product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /products/:id - Delete a product
app.delete('/products/:id', async (req, res) => {
    try {
        const deletedProduct = await Product.findByIdAndDelete(req.params.id);
        if (!deletedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.status(204).send();
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'Product not found' });
        }
        console.error('[Product Service] Error deleting product:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`Product Service running on port ${PORT}`);
});
