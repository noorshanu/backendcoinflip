require("dotenv").config({ path: ".env" });
const express = require("express");
const mongoose = require("mongoose");
const authRoutes = require('./router/authRoutes');
const routes = require('./router/routes');
const superAdminRoutes = require('./router/superAdminRoutes');
const cookieParser = require("cookie-parser");
const cors = require('cors');

// Verify JWT_SECRET is loaded
if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not set in environment variables');
    process.exit(1);
}

const app = express();

const http = require('http');
const server = http.createServer(app);

// CORS configuration - Updated to accept all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'UPDATE', 'PUT', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'x-requested-with', 'Accept'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Other middleware
app.use(cookieParser());
app.use(express.json());

// Database connection
mongoose
  .connect(process.env.mongoose_uri, {
    serverSelectionTimeoutMS: 30000,
  })
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((err) => {
    console.log("Error connecting to MongoDB:", err);
  });

// Add CORS headers to all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }
  next();
});

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Test route
app.get('/testing', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// Routes - make sure to add /api prefix
app.use('/api/auth', authRoutes);
app.use('/api', routes);
app.use('/api/superadmin', superAdminRoutes);

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

server.listen(4000, () => {
  console.log("Server is running at http://localhost:4000");
});

// Export the app for Vercel
module.exports = app;
