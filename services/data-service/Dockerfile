
FROM alpine:latest

# Install ca-certificates and curl for health checks
RUN apk --no-cache add ca-certificates curl

WORKDIR /root/


# Copy the binary from builder stage
COPY data-service .

# Make binary executable
RUN chmod +x ./data-service

# Expose port
EXPOSE 5000

# Run the binary
CMD ["./data-service"]