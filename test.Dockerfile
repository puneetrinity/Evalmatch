FROM alpine:latest
WORKDIR /test
COPY . .
RUN ls -la server/data/ || echo 'No server/data found'

