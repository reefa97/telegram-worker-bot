FROM python:3.13-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for Playwright and general build tools
# We use the 'playwright install-deps' command later, but having basic tools is good.
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to cache dependencies
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers and system dependencies
# This is crucial: --with-deps installs OS-level libraries needed for Chromium
RUN playwright install --with-deps chromium

# Copy the rest of the application code
COPY . .

# Set environment variables (Defaults, can be overridden)
ENV PYTHONUNBUFFERED=1

# Run the worker script
CMD ["python", "worker.py"]
