FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json ./package.json
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/app.mjs"]
