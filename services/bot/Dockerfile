FROM python:3.13-slim

WORKDIR /app

# Устанавливаем зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем код бота
COPY . .

EXPOSE 5004

# Запускаем бота
CMD ["python", "bot.py"]
