# Lab 6: Order Microservice Dockerfile
FROM node:22

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose Order Service port
EXPOSE 3003

# Start Order Service
CMD ["node", "server.js"]
