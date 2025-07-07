FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata curl

WORKDIR /root/

# Copy the pre-built binary
COPY main .

# Copy session file if it exists (optional)
COPY session.json* ./

# Create directory for session storage
RUN mkdir -p /root/data

# Make binary executable
RUN chmod +x ./main

# Expose port
EXPOSE 5002

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5002/health || exit 1

# Run the application
CMD ["./main"]
