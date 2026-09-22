import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Standard error envelope per the Booking Module API Contract §9:
 * { statusCode, code, message, details, timestamp, path }
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message, details } =
      this.normalize(exception);

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }

  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details: Record<string, unknown> | null;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe produces { statusCode, message: string[], error }
      if (statusCode === HttpStatus.BAD_REQUEST && Array.isArray((body as any).message)) {
        return {
          statusCode,
          code: 'VALIDATION_ERROR',
          message: 'Validation failed.',
          details: { fields: (body as any).message },
        };
      }

      // HttpExceptions may carry a custom code in the body
      const bodyObj = typeof body === 'string' ? { message: body } : (body as Record<string, unknown>);
      return {
        statusCode,
        code: (bodyObj.code as string) ?? this.defaultCode(statusCode),
        message: (bodyObj.message as string) ?? exception.message,
        details: (bodyObj.details as Record<string, unknown>) ?? null,
      };
    }

    this.logger.error('Unhandled exception', exception instanceof Error ? exception.stack : String(exception));
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: null,
    };
  }

  private defaultCode(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST: return 'VALIDATION_ERROR';
      case HttpStatus.UNAUTHORIZED: return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN: return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND: return 'NOT_FOUND';
      case HttpStatus.CONFLICT: return 'CONFLICT';
      case HttpStatus.PAYLOAD_TOO_LARGE: return 'FILE_TOO_LARGE';
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE: return 'UNSUPPORTED_MEDIA_TYPE';
      case HttpStatus.TOO_MANY_REQUESTS: return 'RATE_LIMITED';
      case HttpStatus.SERVICE_UNAVAILABLE: return 'SERVICE_UNAVAILABLE';
      default: return 'INTERNAL_ERROR';
    }
  }
}