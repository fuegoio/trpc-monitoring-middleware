import { metrics, trace, type Span } from "@opentelemetry/api";
import { initTRPC } from "@trpc/server";

// Constants
const INTERNAL_ERRORS = new Set([
  "INTERNAL_SERVER_ERROR",
  "NOT_IMPLEMENTED",
  "BAD_GATEWAY",
  "SERVICE_UNAVAILABLE",
  "GATEWAY_TIMEOUT",
]);

// Types
interface MonitoringMiddlewareCompatibleLogger {
  error: (error: Record<string, unknown>, message: string) => void;
  debug: (data: Record<string, unknown>, message: string) => void;
  child: (
    data: Record<string, unknown>,
  ) => MonitoringMiddlewareCompatibleLogger;
}

interface MonitoringMiddlewareOptions {
  onInternalError?: (error: Error) => void;
  logger?: MonitoringMiddlewareCompatibleLogger;
}

// Initialize OpenTelemetry instruments
const tracer = trace.getTracer("trpc");
const meter = metrics.getMeter("trpc");
const trpcProcedures = meter.createCounter("trpc.procedures");
const trpcTime = meter.createHistogram("trpc.time");

// Helper function to create span attributes
function createSpanAttributes(path: string, type: string) {
  return { path, type };
}

// Helper function to handle procedure completion
function handleProcedureCompletion(
  span: Span,
  procedure: { ok: boolean; error?: { code: string } },
  meta: { path: string; type: string },
  logger?: MonitoringMiddlewareCompatibleLogger,
) {
  span.setAttributes({ ok: procedure.ok });

  if (!procedure.ok && procedure.error) {
    const isInternalError = INTERNAL_ERRORS.has(procedure.error.code);
    span.setAttributes({
      error_code: procedure.error.code,
      internal_error: isInternalError,
    });

    if (isInternalError) {
      logger?.error({ error: procedure.error }, "[trpc] Internal error");
    }

    trpcProcedures.add(1, {
      ...meta,
      error_code: procedure.error.code,
      ok: false,
    });
  } else {
    trpcProcedures.add(1, { ...meta, ok: true });
  }
}

// Helper function to handle unexpected errors
function handleUnexpectedError(
  error: unknown,
  span: Span,
  meta: { path: string; type: string },
  logger?: MonitoringMiddlewareCompatibleLogger,
  onInternalError?: (error: Error) => void,
) {
  span.setAttributes({ ok: false, unexpected_error: true });
  logger?.error({ error }, "[trpc] Unexpected error");
  trpcProcedures.add(1, {
    ...meta,
    ok: false,
    error_code: "UNEXPECTED_ERROR",
  });
  onInternalError?.(error as Error);
  throw error;
}

/**
 * Creates a middleware for monitoring tRPC procedures using OpenTelemetry.
 *
 * @param pluginOpts - Optional configuration for the middleware.
 */
export function createMonitoringMiddleware(
  pluginOpts?: MonitoringMiddlewareOptions,
) {
  const t = initTRPC.create();
  const { onInternalError, logger } = pluginOpts ?? {};

  return t.procedure.use((opts) => {
    return tracer.startActiveSpan(
      `trpc/${opts.path} (${opts.type})`,
      async (span) => {
        const start = performance.now();
        const meta = createSpanAttributes(opts.path, opts.type);
        const procedureLogger = logger?.child({
          procedure: meta,
        });

        span.setAttributes(meta);

        try {
          procedureLogger?.debug({ ...opts }, "[trpc] Starting procedure");

          const procedure = await opts.next({
            ctx: {
              logger: procedureLogger,
            },
          });

          handleProcedureCompletion(span, procedure, meta, procedureLogger);

          procedureLogger?.debug(
            {
              ...opts,
              ok: procedure.ok,
              duration: performance.now() - start,
            },
            "[trpc] Completed procedure",
          );
          return procedure;
        } catch (error) {
          handleUnexpectedError(
            error,
            span,
            meta,
            procedureLogger,
            onInternalError,
          );
          throw error;
        } finally {
          span.end();
          const end = performance.now();
          trpcTime.record(end - start, meta);
        }
      },
    );
  });
}
