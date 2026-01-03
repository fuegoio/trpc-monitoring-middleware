# tRPC monitoring middleware

[![npm version](https://img.shields.io/npm/v/trpc-monitoring-middleware.svg)](https://www.npmjs.com/package/trpc-monitoring-middleware)
[![license](https://img.shields.io/npm/l/trpc-monitoring-middleware.svg)](https://github.com/fuegoio/trpc-monitoring-middleware/blob/main/LICENSE)

A simple tRPC middleware for monitoring and logging procedures.

## Features

- OpenTelemetry integration for metrics and traces
- Requests logging

## Installation

```bash
npm install trpc-monitoring-middleware
```

## Usage

```typescript
import { initTRPC } from "@trpc/server";
import { createMonitoringMiddleware } from "trpc-monitoring-middleware";

const t = initTRPC.create();

const monitoringMiddleware = createMonitoringMiddleware();

export const publicProcedure = procedure.concat(monitoringMiddleware);
```

## OpenTelemetry Integration

The middleware automatically exports the following metrics:

- `trpc.procedures`: Counter for the total number of tRPC procedure calls
- `trpc.time`: Histogram for the duration of tRPC procedure execution in milliseconds

These metrics are labeled with:

- `path`: The tRPC procedure path
- `type`: The procedure type (query/mutation/subscription)
- `ok`: Boolean indicating success/failure
- `error_code`: Error code for failed procedures

The middleware also creates OpenTelemetry traces for each procedure call with:

- Span name: `trpc/${path} (${type})`
- Attributes: path, type, ok status, and error details

## Logging Integration

The middleware provides structured logging through a compatible logger interface. It is recommended to use [Pino](https://github.com/pinojs/pino) or [Winston](https://github.com/winstonjs/winston) as a logger.

- **Procedure-specific logging**: Each procedure gets a child logger with procedure context
- **Error logging**: Internal errors and unexpected errors are logged with full error details
- **Error classification**: Internal server errors are automatically detected and logged separately

Error codes classified as internal errors:

- `INTERNAL_SERVER_ERROR`
- `NOT_IMPLEMENTED`
- `BAD_GATEWAY`
- `SERVICE_UNAVAILABLE`
- `GATEWAY_TIMEOUT`

### Debug Logging

The middleware automatically logs all tRPC procedure executions in `DEBUG` level with detailed information:

- **Start events**: Logged when a procedure starts execution with path and type
- **Completion events**: Logged when a procedure completes successfully with duration

## Configuration

```typescript
import { createMonitoringMiddleware } from "trpc-monitoring-middleware";

const monitoringMiddleware = createMonitoringMiddleware({
  onInternalError: (error: Error) => {
    // Custom error handling
    console.error("Internal error:", error);
  },
  logger: {
    error: (errorData, message) => {
      // Custom error logging
      console.error(message, errorData);
    },
    debug: (data, message) => {
      // Custom debug logging
      console.log(message, data);
    },
    child: (data) => {
      // Return a new logger instance with additional context
      return {
        error: (errorData, message) => {
          console.error(message, { ...data, ...errorData });
        },
        debug: (debugData, message) => {
          console.log(message, { ...data, ...debugData });
        },
        child: (additionalData) => {
          return this.child({ ...data, ...additionalData });
        },
      };
    },
  },
});
```

## License

MIT
