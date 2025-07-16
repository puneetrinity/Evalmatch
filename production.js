// Production server entry point
// This file ensures we're starting the server with the correct environment variables
// and configurations for production deployment

// Set production environment
process.env.NODE_ENV = 'production';

// Import the production server (which uses simplified DB connection)
import './server/production.js';