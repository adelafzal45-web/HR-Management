import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter.
 *
 * Normalizes every error thrown anywhere in the app into one consistent JSON
 * body so the frontend can rely on a single shape:
 *
 *   {
 *     statusCode: number,
 *     message: string | string[],
 *     error: string,
 *     path: string,
 *     timestamp: string
 *   }
 *
 * - HttpExceptions (NotFound, Forbidden, class-validator BadRequest, etc.)
 *   keep their status and message.
 * - Anything else becomes a 500 with a generic message (the real error is
 *   logged server-side, never leaked to the client).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (res && typeof res === 'object') {
        const {
          message: rawMessage,
          error: rawError,
          statusCode: _ignored,
          ...rest
        } = res as Record<string, unknown>;
        message = (rawMessage as string | string[]) ?? exception.message;
        error = (rawError as string) ?? exception.name;
        // Anything else the thrower attached is carried through rather than
        // discarded. Some errors are only actionable with their detail — a 429
        // without its `retryAfter` tells the client to back off but not for how
        // long. The three normalized keys are destructured out above so a
        // thrower can never overwrite them from `rest`.
        extra = rest;
      }
    } else if (exception instanceof Error) {
      // Unexpected, non-HTTP error — log the details, return a safe message.
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      ...extra,
      statusCode,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
