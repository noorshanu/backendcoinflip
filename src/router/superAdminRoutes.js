const express = require('express');
const router = express.Router();
const SuperAdmin = require('../models/SuperAdmin');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// Signup route
router.post('/signup', async (req, res) => {
    try {
        const { name, phone, password } = req.body;

        // Check if superadmin already exists
        const existingAdmin = await SuperAdmin.findOne({ phone });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Phone number already registered'
            });
        }

        // Create new superadmin
        const superAdmin = new SuperAdmin({
            name,
            phone,
            password
        });

        await superAdmin.save();

        // Generate JWT token
        const token = jwt.sign(
            { id: superAdmin._id, isAdmin: true },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            message: 'SuperAdmin created successfully',
            data: {
                token,
                superAdmin: {
                    id: superAdmin._id,
                    name: superAdmin.name,
                    phone: superAdmin.phone,
                    isActive: superAdmin.isActive,
                    points: superAdmin.points
                }
            }
        });
    } catch (error) {
        console.error('SuperAdmin signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating superadmin',
            error: error.message
        });
    }
});

// Login route
router.post('/login', async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Find superadmin by phone
        const superAdmin = await SuperAdmin.findOne({ phone });
        if (!superAdmin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Check if superadmin is active
        if (!superAdmin.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isMatch = await superAdmin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number or password'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: superAdmin._id, isAdmin: true },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                superAdmin: {
                    id: superAdmin._id,
                    name: superAdmin.name,
                    phone: superAdmin.phone,
                    isActive: superAdmin.isActive,
                    points: superAdmin.points
                }
            }
        });
    } catch (error) {
        console.error('SuperAdmin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during login',
            error: error.message
        });
    }
});

// Get superadmin profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const superAdmin = await SuperAdmin.findById(req.user.id).select('-password');
        if (!superAdmin) {
            return res.status(404).json({
                success: false,
                message: 'SuperAdmin not found'
            });
        }

        res.json({
            success: true,
            data: superAdmin
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            error: error.message
        });
    }
});

module.exports = router; 