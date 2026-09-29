# Lab 6: Product Microservice Dockerfile
FROM node:22

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose Product Service port
EXPOSE 3002

# Start Product Service
CMD ["node", "server.js"]
