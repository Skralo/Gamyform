FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
COPY --from=build /app/package*.json ./
# tsx is needed at runtime because the server source is TypeScript.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/src/domain.ts /app/src/seed.ts /app/src/id.ts ./src/
COPY --from=build /app/dist ./dist
RUN mkdir /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "--import", "tsx", "server/index.ts"]
