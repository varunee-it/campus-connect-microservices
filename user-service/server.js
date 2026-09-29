const path = require('path');
require('dotenv').config({ path: [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')] });

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/User');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const mongoUri = process.env.MONGO_URI || process.env.USER_SERVICE_MONGO_URI;

if (!mongoUri) {
    console.error('[User Service] ERROR: MONGO_URI or USER_SERVICE_MONGO_URI environment variable is missing.');
} else {
    mongoose.connect(mongoUri)
        .then(() => console.log(`[User Service] Connected to MongoDB at: ${mongoUri.replace(/:[^:@]+@/, ':****@')}`))
        .catch(err => console.error('[User Service] MongoDB connection error:', err));
}

// Helper for basic validation
const validateUser = (data, isPatch = false) => {
    const { name, email, course, semester } = data;
    if (!isPatch || name !== undefined) {
        if (!name || typeof name !== 'string' || name.trim() === '') return 'Invalid or missing name';
    }
    if (!isPatch || email !== undefined) {
        if (!email || typeof email !== 'string' || !email.includes('@')) return 'Invalid or missing email';
    }
    if (!isPatch || course !== undefined) {
        if (!course || typeof course !== 'string' || course.trim() === '') return 'Invalid or missing course';
    }
    if (!isPatch || semester !== undefined) {
        if (semester === undefined || typeof semester !== 'number' || semester < 1) return 'Invalid or missing semester';
    }
    return null;
};

// Health Check
const PORT = process.env.PORT || process.env.USER_SERVICE_PORT || 3001;

app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'user-service',
        status: 'UP',
        port: PORT,
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// GET /users - List all users
app.get(['/users', '/students'], async (req, res) => {
    try {
        const users = await User.find({});
        res.status(200).json(users);
    } catch (error) {
        console.error('[User Service] Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /users/:id - Get user by ID
app.get(['/users/:id', '/students/:id'], async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json(user);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'User not found' });
        }
        console.error('[User Service] Error fetching user by ID:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /users - Create a new user
app.post(['/users', '/students'], async (req, res) => {
    const errorMsg = validateUser(req.body);
    if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
    }

    try {
        const { name, email, course, semester } = req.body;
        const newUser = new User({ name, email, course, semester });
        const savedUser = await newUser.save();
        res.status(201).json(savedUser);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        console.error('[User Service] Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /users/:id - Update an existing user
app.put(['/users/:id', '/students/:id'], async (req, res) => {
    const errorMsg = validateUser(req.body);
    if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
    }

    try {
        const { name, email, course, semester } = req.body;
        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            { name, email, course, semester },
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json(updatedUser);
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'User not found' });
        }
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        console.error('[User Service] Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /users/:id - Delete a user
app.delete(['/users/:id', '/students/:id'], async (req, res) => {
    try {
        const deletedUser = await User.findByIdAndDelete(req.params.id);
        if (!deletedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(204).send();
    } catch (error) {
        if (error.name === 'CastError') {
            return res.status(404).json({ error: 'User not found' });
        }
        console.error('[User Service] Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(PORT, () => {
    console.log(`User Service running on port ${PORT}`);
});
