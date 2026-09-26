# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS deps
# Mesma profundidade do repositório (apps/web ao lado de schema/): o package-lock guarda o
# @erp/schema como link relativo (../../schema/generated/ts) e o `npm ci` só resolve esse link se
# a distância até o schema for a mesma daqui.
WORKDIR /repo/apps/web
# O lock precisa ir junto: sem ele o install resolve versões novas a cada build (não reproduzível).
COPY apps/web/package.json apps/web/package-lock.json ./
COPY apps/web/packages/shared/package.json ./packages/shared/
COPY apps/web/shell/package.json ./shell/
COPY apps/web/mfes/auth/package.json ./mfes/auth/
COPY apps/web/mfes/config/package.json ./mfes/config/
COPY apps/web/mfes/stock/package.json ./mfes/stock/
COPY apps/web/mfes/sales/package.json ./mfes/sales/
COPY apps/web/mfes/purchasing/package.json ./mfes/purchasing/
COPY apps/web/mfes/assets/package.json ./mfes/assets/
COPY apps/web/mfes/cashflow/package.json ./mfes/cashflow/
COPY apps/web/mfes/invoicing/package.json ./mfes/invoicing/
COPY apps/web/mfes/bi/package.json ./mfes/bi/
COPY apps/web/mfes/reports/package.json ./mfes/reports/
# @erp/schema é uma dependência "file:" (../../schema/generated/ts a partir de /repo/apps/web) — copie
# o fonte para lá antes do install, que cria o symlink.
COPY schema/generated/ts /repo/schema/generated/ts
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM deps AS src
COPY apps/web ./

FROM src AS test
RUN npm test --workspaces --if-present

FROM src AS build
ENV VITE_MFE_MODE=relative
ENV VITE_MFE_VERSION=46
ENV VITE_MINIFY=1
RUN set -eu; \
    pids=""; \
    run() { VITE_BASE="$1" npm run build -w "$2" & pids="$pids $!"; }; \
    run /mfe/auth/ @erp/auth; \
    run /mfe/config/ @erp/config; \
    run /mfe/stock/ @erp/stock; \
    run /mfe/sales/ @erp/sales; \
    run /mfe/purchasing/ @erp/purchasing; \
    run /mfe/assets/ @erp/assets; \
    run /mfe/cashflow/ @erp/cashflow; \
    run /mfe/invoicing/ @erp/invoicing; \
    run /mfe/bi/ @erp/bi; \
    run /mfe/reports/ @erp/reports; \
    for p in $pids; do wait "$p"; done; \
    npm run build -w shell

FROM nginx:1.27-alpine
COPY apps/web/docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=test /repo/apps/web/package.json /tmp/.tests-ok
COPY --from=build /repo/apps/web/shell/dist /usr/share/nginx/html/shell
COPY --from=build /repo/apps/web/mfes/auth/dist /usr/share/nginx/html/auth
COPY --from=build /repo/apps/web/mfes/config/dist /usr/share/nginx/html/config
COPY --from=build /repo/apps/web/mfes/stock/dist /usr/share/nginx/html/stock
COPY --from=build /repo/apps/web/mfes/sales/dist /usr/share/nginx/html/sales
COPY --from=build /repo/apps/web/mfes/purchasing/dist /usr/share/nginx/html/purchasing
COPY --from=build /repo/apps/web/mfes/assets/dist /usr/share/nginx/html/assets
COPY --from=build /repo/apps/web/mfes/cashflow/dist /usr/share/nginx/html/cashflow
COPY --from=build /repo/apps/web/mfes/invoicing/dist /usr/share/nginx/html/invoicing
COPY --from=build /repo/apps/web/mfes/bi/dist /usr/share/nginx/html/bi
COPY --from=build /repo/apps/web/mfes/reports/dist /usr/share/nginx/html/reports
