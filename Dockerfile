# syntax=docker/dockerfile:1.7
# Production image: Next.js standalone output on Node 22 (≈150 MB).

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined at build time — pass them as build args.
ARG NEXT_PUBLIC_APP_URL=https://automation.asdesignlb.com
ARG NEXT_PUBLIC_SITE_URL=https://asdesignlb.com
ARG NEXT_PUBLIC_CONTACT_EMAIL=hello@asdesignlb.com
ARG NEXT_PUBLIC_BOOKING_URL=
ARG NEXT_PUBLIC_STUDIO_LOCATION=
ARG NEXT_PUBLIC_CURRENCY=USD
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL NEXT_PUBLIC_BOOKING_URL=$NEXT_PUBLIC_BOOKING_URL \
    NEXT_PUBLIC_STUDIO_LOCATION=$NEXT_PUBLIC_STUDIO_LOCATION NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 LOCAL_DATA_DIR=/app/.data
RUN addgroup -S nodejs -g 1001 && adduser -S nextjs -u 1001 -G nodejs \
 && mkdir -p /app/.data && chown nextjs:nodejs /app/.data
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1
CMD ["node", "server.js"]
