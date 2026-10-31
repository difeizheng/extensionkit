# ExtensionKit license server — container image
# Node built-ins only, no npm install. node:sqlite needs Node >= 22.5.
FROM node:22-alpine

WORKDIR /app

# server/ has zero dependencies, so there is no install step at all
COPY server/ ./

ENV NODE_ENV=production \
    PORT=8787 \
    DB_FILE=/data/licenses.db

RUN mkdir -p /data && adduser -D -u 10001 app && chown -R app:app /data /app
USER app

VOLUME ["/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
