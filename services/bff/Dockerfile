
FROM alpine:latest

# Install ca-certificates and curl for health checks
RUN apk --no-cache add ca-certificates curl

WORKDIR /root/

# Copy the binary from builder stage
COPY main .

# Make binary executable
RUN chmod +x ./main

# Expose port
EXPOSE 5000

# Run the binary
CMD ["./main"]
