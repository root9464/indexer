# Многоэтапная сборка для фронтенда
FROM node:22-alpine AS frontend-builder

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем только package файлы для лучшего кэширования
COPY package*.json ./

# Устанавливаем зависимости с оптимизацией
RUN npm ci 

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Финальный образ с Caddy
FROM caddy:2-alpine

# Создаем непривилегированного пользователя
RUN addgroup -g 1001 -S caddy && \
    adduser -S -D -H -u 1001 -h /var/cache/caddy -s /sbin/nologin -G caddy -g caddy caddy

# Устанавливаем curl для health check (легче wget)
RUN apk add --no-cache curl

# Копируем собранное приложение
COPY --from=frontend-builder /app/dist /usr/share/caddy

# Копируем Caddyfile
COPY Caddyfile /etc/caddy/Caddyfile

# Создаем директории с правильными правами
RUN mkdir -p /data/caddy /config/caddy && \
    chown -R caddy:caddy /data/caddy /config/caddy /usr/share/caddy

# Переключаемся на непривилегированного пользователя
USER caddy

# Открываем порты
EXPOSE 80 443

# Оптимизированный health check - ИСПРАВЛЕНО
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Запускаем Caddy
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
