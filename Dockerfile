# Step 1: Use an official Node.js runtime as a parent image
FROM node:18-slim

# Step 2: Set the working directory in the container
WORKDIR /usr/src/app

# Step 3: Install dependencies needed to run a headless Chrome
# This is the crucial part that installs Chrome into your environment
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends

# Step 4: Install Chrome itself
RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get install -y ./google-chrome-stable_current_amd64.deb && \
    rm google-chrome-stable_current_amd64.deb

# Step 5: Copy application dependency manifests to the container image
COPY package.json package-lock.json ./

# Step 6: Install production dependencies.
# We set an ENV var to tell Puppeteer not to download its own (incompatible) browser.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm install --production

# Step 7: Copy local code to the container image
COPY . ./

# Step 8: Specify the command to run on container startup
CMD ["node", "server.js"]
