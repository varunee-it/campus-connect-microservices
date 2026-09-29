# Lab 6: User Microservice Dockerfile
FROM node:22

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application source code
COPY . .

# Expose User Service port
EXPOSE 3001

# Start User Service
CMD ["node", "server.js"]
