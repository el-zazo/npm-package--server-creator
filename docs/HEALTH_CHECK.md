# Health Check

The server provides a built-in health check endpoint for monitoring, container orchestration, and load balancer probes.

## Endpoint

```
GET /health
```

This endpoint is registered during `Server` construction, **before** any collection routes or custom routes are mounted. It is always accessible regardless of authentication configuration, route ordering, or middleware setup. No JWT token is required.

---

## Response Format

### Healthy (200 OK)

When the database is connected and responding:

```json
{
  "status": "ok",
  "timestamp": "2025-06-15T10:30:00.000Z",
  "uptime": 3600.123,
  "database": "connected"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"ok"` when the database is connected or no database is configured |
| `timestamp` | `string` | ISO 8601 timestamp of when the health check was performed |
| `uptime` | `number` | Process uptime in seconds (from `process.uptime()`) |
| `database` | `string` | `"connected"` if the database ping succeeds |

### Degraded (503 Service Unavailable)

When the database is configured but the ping fails:

```json
{
  "status": "degraded",
  "timestamp": "2025-06-15T10:30:00.000Z",
  "uptime": 3600.123,
  "database": "error"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `"degraded"` when the database ping throws an error |
| `timestamp` | `string` | ISO 8601 timestamp |
| `uptime` | `number` | Process uptime in seconds |
| `database` | `string` | `"error"` when the ping fails |

### No Database Configured (200 OK)

When the `Server` instance has not been assigned a `db` reference (i.e., `this.db` is falsy), the health check returns `"ok"` with `database: "disconnected"`:

```json
{
  "status": "ok",
  "timestamp": "2025-06-15T10:30:00.000Z",
  "uptime": 5.678,
  "database": "disconnected"
}
```

This scenario occurs when the `Server` is created standalone without a `DB` instance, or before `DB.start()` has been called.

---

## How It Works

The health check flow is as follows:

1. The endpoint builds a response object with `status: "ok"`, the current timestamp, process uptime, and `database: "disconnected"`.
2. If `this.db` is set (the `DB` class assigns `this.server.db = this` during construction), it calls `await this.db.ping()`.
3. The `ping()` method delegates to the database adapter:
   - **MongoDB:** Checks `mongoose.connection.readyState === 1`, then runs `mongoose.connection.db.admin().ping()`. Throws `"MongoDB is not connected"` if the readyState is not 1.
   - **MySQL:** Checks `this.sequelize` is truthy, then runs `this.sequelize.authenticate()`. Throws `"MySQL is not connected"` if the Sequelize instance is null.
4. If the ping succeeds, `database` is set to `"connected"` and the response is sent with status 200.
5. If the ping throws, `status` is set to `"degraded"`, `database` to `"error"`, and the response is sent with HTTP status **503**.

---

## Usage Examples

### cURL

```bash
# Basic health check
curl http://localhost:3000/health

# Check HTTP status code only (for scripts)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
```

### Docker HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

The `-f` flag (`--fail`) makes curl return a non-zero exit code on HTTP errors (including 503), which Docker interprets as an unhealthy state.

### Kubernetes livenessProbe / readinessProbe

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: api
      image: my-app:latest
      livenessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 10
        periodSeconds: 30
      readinessProbe:
        httpGet:
          path: /health
          port: 3000
        initialDelaySeconds: 5
        periodSeconds: 10
```

- **livenessProbe:** Restarts the pod if `/health` returns 503 consistently (database down, deadlock, etc.).
- **readinessProbe:** Removes the pod from the Service load balancer while the database is unreachable, preventing traffic from being routed to an unhealthy instance.

### Docker Compose healthcheck

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

---

## Important Notes

### No Authentication Required

The `/health` endpoint is deliberately unauthenticated. It is registered before any middleware that could require a JWT token, making it accessible even when auth is misconfigured or the JWT secret is missing.

### Rate Limiting Applies

The global rate limiter (`defaultRateLimiter`: 100 requests per 15 minutes per IP) applies to the `/health` endpoint as well. For monitoring systems that poll frequently, consider:
- Using a reasonable polling interval (every 30 seconds is typically sufficient).
- Running the health checker from a trusted network location to avoid sharing the rate limit with user traffic.

### Not Overridable

Because `/health` is registered in the `Server` constructor before any collection routes are added, you cannot accidentally override it with a custom route. If you add a custom `GET /health` route via `otherRoutes`, Express will match the built-in one first since it was registered earlier in the middleware stack.

### Database Ping Overhead

The health check performs an actual database round-trip on every request:
- **MongoDB:** One `ping` command to the admin database.
- **MySQL:** One `SELECT 1+1` (via `sequelize.authenticate()`).

This is intentionally lightweight but does add latency. If your monitoring system polls very aggressively, consider caching the result briefly at the infrastructure level (e.g., a reverse proxy or load balancer with a short cache TTL).

### Graceful Shutdown Integration

When the server receives `SIGTERM` or `SIGINT`, it begins a graceful shutdown:
1. Stops accepting new connections.
2. Disconnects from the database.
3. Exits after a 100ms delay (or force-exits after 10 seconds if shutdown hangs).

During the shutdown sequence, the `/health` endpoint may return `"degraded"` with a 503 status as the database disconnects. Container orchestration systems that detect this will stop routing traffic to the instance.

---

## Troubleshooting

### `/health` returns 503 but the database seems fine

1. Check the server logs for the actual ping error. The health check catches the error but does not include the error message in the response for security reasons.
2. For MongoDB: verify `mongoose.connection.readyState` is `1` (connected). The ping throws if the readyState is anything else.
3. For MySQL: verify the Sequelize instance is initialized. If `this.sequelize` is `null`, the ping throws immediately.
4. Check network connectivity between the server and the database host.

### `/health` returns `"disconnected"` for database

This means `this.db` is not set on the `Server` instance. This can happen if:
- The `DB` class was not used (you created a `Server` directly without the `DB` wrapper).
- The health check is called before `DB.start()` completes (the `DB` constructor sets `this.server.db = this`, so this should not normally happen if using the standard setup).

---

← [Back to README](../README.md)
