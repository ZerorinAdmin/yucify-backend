import { SeverityNumber } from "@opentelemetry/api-logs";
import { after } from "next/server";
import { loggerProvider } from "@/instrumentation";

const logger = loggerProvider.getLogger("repto");

type LogAttributes = Record<string, string | number | boolean | undefined>;

/**
 * Server-side logger that sends logs to PostHog.
 * Call flushAfterResponse() in API routes after logging to ensure logs are sent.
 */
export const serverLogger = {
  info(body: string, attributes?: LogAttributes) {
    logger.emit({
      body,
      severityNumber: SeverityNumber.INFO,
      attributes: attributes as Record<string, string | number | boolean>,
    });
  },
  warn(body: string, attributes?: LogAttributes) {
    logger.emit({
      body,
      severityNumber: SeverityNumber.WARN,
      attributes: attributes as Record<string, string | number | boolean>,
    });
  },
  error(body: string, attributes?: LogAttributes) {
    logger.emit({
      body,
      severityNumber: SeverityNumber.ERROR,
      attributes: attributes as Record<string, string | number | boolean>,
    });
  },
};

/**
 * Call this at the end of API route handlers to flush logs before the serverless function freezes.
 * Usage: after(async () => { await flushLogs() })
 */
export async function flushLogs() {
  await loggerProvider.forceFlush();
}

/**
 * Helper to use in API routes: logs and schedules flush after response.
 * Usage: logAndFlush(() => serverLogger.error('Failed', { endpoint: '/api/foo' }))
 */
export function logAndFlush(fn: () => void) {
  fn();
  after(flushLogs);
}
