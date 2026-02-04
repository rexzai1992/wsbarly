
# Multi-stage Dockerfile for Easy Deployment

# Stage 1: Build Frontend
FROM node:20-alpine as frontend_builder
WORKDIR /app/dashboard
# Copy dashboard package files
COPY dashboard/package*.json ./
# Install frontend deps
RUN npm install
# Copy frontend source
COPY dashboard/ .
# Build Vite app
RUN npm run build

# Stage 2: Backend Runtime
FROM node:20-alpine
WORKDIR /app

# Install backend dependencies (including devDependencies for tsx)
COPY package*.json ./
RUN npm install

# Copy backend source code
COPY . .

# Copy built frontend assets from Stage 1
COPY --from=frontend_builder /app/dashboard/dist ./dashboard/dist

# Expose the application port
EXPOSE 3001

# Run the server
CMD ["npx", "tsx", "dashboard-server.ts"]
