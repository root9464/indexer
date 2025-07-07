FROM golang:1.24-alpine

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Expose port
EXPOSE 5001

# Run the application directly with go run
CMD ["go", "run", "main.go"]
