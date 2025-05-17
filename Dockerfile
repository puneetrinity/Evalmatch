FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Create uploads directory
RUN mkdir -p uploads && chmod 755 uploads

# Copy all source files
COPY . .

# Build the application
RUN npm run build

# Environment variables will be set in Render dashboard
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port the app runs on
EXPOSE 3000

# Command to run the app
CMD ["node", "dist/index.js"]