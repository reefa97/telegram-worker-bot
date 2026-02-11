# Build stage
FROM rust:1.85-slim-bookworm as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy local code
COPY . .

# Build the application
RUN cargo build --release

# Run stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/email-service /app/email-service

# Expose the API port
EXPOSE 8080

# Run the binary
CMD ["/app/email-service"]
