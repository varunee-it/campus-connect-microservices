# Lab 7: API Gateway Dockerfile
FROM node:22

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose API Gateway port
EXPOSE 8000

# Start API Gateway
CMD ["node", "server.js"]
