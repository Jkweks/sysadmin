# Build lightweight image for the admin API
FROM node:20-alpine

WORKDIR /app

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy source code
COPY src ./src
COPY services.config.json ./services.config.json
COPY devices.config.json ./devices.config.json

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["npm", "start"]
