import { PostgrestError } from '@supabase/supabase-js';
import { 
  AppError, 
  ServiceError, 
  DatabaseError, 
  // ValidationError is used in error handling patterns
  createServiceError,
  createDatabaseError,
  createValidationError,
  getErrorMessage
} from '@/types/errors';
import { debugError, debugService, debugWarning } from '@/lib/debug-utils';

/**
 * Base service class providing common functionality for all services
 */
export abstract class BaseService {
  protected abstract serviceName: ServiceError['service'];

  /**
   * Handle and transform errors into consistent AppError format
   */
  protected handleError(error: unknown, operation?: string): AppError {
    let appError: AppError;

    // Handle PostgreSQL/Supabase errors
    if (this.isPostgrestError(error)) {
      appError = this.handleDatabaseError(error, operation);
      
      // Log database error to debug monitor
      debugError(
        `Database Error in ${this.serviceName}: ${error.message}`,
        this.serviceName,
        {
          operation,
          errorCode: error.code,
          errorDetails: error.details,
          errorHint: error.hint,
          timestamp: new Date().toISOString(),
        },
        new Error(error.message),
        'database'
      );
    }
    // Handle validation errors
    else if (this.isValidationError(error)) {
      appError = createValidationError(
        getErrorMessage(error),
        undefined,
        { constraints: [getErrorMessage(error)] }
      );
      
      // Log validation error to debug monitor
      debugWarning(
        `Validation Error in ${this.serviceName}: ${getErrorMessage(error)}`,
        this.serviceName,
        {
          operation,
          validationMessage: getErrorMessage(error),
          timestamp: new Date().toISOString(),
        },
        'validation'
      );
    }
    // Handle service errors
    else if (error instanceof Error) {
      appError = createServiceError(
        error.message,
        this.serviceName,
        operation
      );
      
      // Log service error to debug monitor
      debugError(
        `Service Error in ${this.serviceName}: ${error.message}`,
        this.serviceName,
        {
          operation,
          errorName: error.name,
          errorStack: error.stack,
          timestamp: new Date().toISOString(),
        },
        error,
        'service'
      );
    }
    // Handle unknown errors
    else {
      const message = getErrorMessage(error);
      appError = createServiceError(
        message,
        this.serviceName,
        operation
      );
      
      // Log unknown error to debug monitor
      debugError(
        `Unknown Error in ${this.serviceName}: ${message}`,
        this.serviceName,
        {
          operation,
          unknownError: error,
          errorType: typeof error,
          timestamp: new Date().toISOString(),
        },
        undefined,
        'service'
      );
    }

    return appError;
  }

  /**
   * Handle database-specific errors
   */
  private handleDatabaseError(error: PostgrestError, operation?: string): DatabaseError {
    const message = error.message || 'Database operation failed';
    let table: string | undefined;
    let dbOperation: DatabaseError['operation'];

    // Extract table name from error details if available
    if (error.details) {
      const tableMatch = error.details.match(/table "([^"]+)"/);
      if (tableMatch) {
        table = tableMatch[1];
      }
    }

    // Map operation types
    switch (error.code) {
      case '23505': // unique_violation
        dbOperation = 'create';
        break;
      case '23503': // foreign_key_violation
        dbOperation = 'create';
        break;
      case '23514': // check_violation
        dbOperation = 'create';
        break;
      case 'PGRST116': // not found
        dbOperation = 'read';
        break;
      default:
        dbOperation = operation as DatabaseError['operation'];
    }

    return createDatabaseError(
      message,
      table,
      dbOperation,
      {
        constraint: error.code,
        column: error.hint
      }
    );
  }

  /**
   * Type guard for PostgreSQL errors
   */
  private isPostgrestError(error: unknown): error is PostgrestError {
    return (
      error !== null &&
      typeof error === 'object' &&
      'message' in error &&
      ('code' in error || 'details' in error)
    );
  }

  /**
   * Type guard for validation errors
   */
  private isValidationError(error: unknown): boolean {
    if (error instanceof Error) {
      return error.message.includes('validation') || 
             error.message.includes('invalid') ||
             error.message.includes('required');
    }
    return false;
  }

  /**
   * Validate required fields
   */
  protected validateRequired(data: Record<string, unknown>, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(field => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });

    if (missingFields.length > 0) {
      throw createValidationError(
        `Missing required fields: ${missingFields.join(', ')}`,
        missingFields[0],
        { 
          constraints: missingFields.map(field => `${field} is required`),
          expected: 'non-empty value',
          received: 'empty/null/undefined'
        }
      );
    }
  }

  /**
   * Validate UUID format
   */
  protected validateUUID(id: string, fieldName: string = 'id'): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      throw createValidationError(
        `Invalid ${fieldName} format`,
        fieldName,
        {
          expected: 'valid UUID',
          received: id,
          constraints: ['Must be a valid UUID format']
        }
      );
    }
  }

  /**
   * Validate email format
   */
  protected validateEmail(email: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw createValidationError(
        'Invalid email format',
        'email',
        {
          expected: 'valid email address',
          received: email,
          constraints: ['Must be a valid email format']
        }
      );
    }
  }

  /**
   * Validate URL format
   */
  protected validateURL(url: string, fieldName: string = 'url'): void {
    try {
      new URL(url);
    } catch {
      throw createValidationError(
        `Invalid ${fieldName} format`,
        fieldName,
        {
          expected: 'valid URL',
          received: url,
          constraints: ['Must be a valid URL format']
        }
      );
    }
  }

  /**
   * Validate string length
   */
  protected validateStringLength(
    value: string, 
    fieldName: string, 
    minLength: number = 0, 
    maxLength: number = Infinity
  ): void {
    if (value.length < minLength) {
      throw createValidationError(
        `${fieldName} must be at least ${minLength} characters`,
        fieldName,
        {
          expected: `minimum ${minLength} characters`,
          received: `${value.length} characters`,
          constraints: [`Minimum length: ${minLength}`]
        }
      );
    }

    if (value.length > maxLength) {
      throw createValidationError(
        `${fieldName} must be at most ${maxLength} characters`,
        fieldName,
        {
          expected: `maximum ${maxLength} characters`,
          received: `${value.length} characters`,
          constraints: [`Maximum length: ${maxLength}`]
        }
      );
    }
  }

  /**
   * Validate array length
   */
  protected validateArrayLength(
    array: unknown[], 
    fieldName: string, 
    minLength: number = 0, 
    maxLength: number = Infinity
  ): void {
    if (array.length < minLength) {
      throw createValidationError(
        `${fieldName} must contain at least ${minLength} items`,
        fieldName,
        {
          expected: `minimum ${minLength} items`,
          received: `${array.length} items`,
          constraints: [`Minimum items: ${minLength}`]
        }
      );
    }

    if (array.length > maxLength) {
      throw createValidationError(
        `${fieldName} must contain at most ${maxLength} items`,
        fieldName,
        {
          expected: `maximum ${maxLength} items`,
          received: `${array.length} items`,
          constraints: [`Maximum items: ${maxLength}`]
        }
      );
    }
  }

  /**
   * Wrap service operations with consistent error handling
   */
  protected async executeOperation<T>(
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Log operation start to debug monitor
      debugService(
        `Starting operation: ${operation}`,
        this.serviceName,
        {
          operation,
          startTime: new Date(startTime).toISOString(),
        }
      );
      
      const result = await fn();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log successful operation to debug monitor
      debugService(
        `Completed operation: ${operation}`,
        this.serviceName,
        {
          operation,
          duration,
          endTime: new Date(endTime).toISOString(),
          success: true,
        }
      );
      
      // Warning for slow operations
      if (duration > 5000) {
        debugWarning(
          `Slow operation detected: ${operation} took ${duration}ms`,
          this.serviceName,
          {
            operation,
            duration,
            threshold: 5000,
          },
          'performance'
        );
      }
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Log failed operation to debug monitor
      debugService(
        `Failed operation: ${operation}`,
        this.serviceName,
        {
          operation,
          duration,
          endTime: new Date(endTime).toISOString(),
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        true
      );
      
      throw this.handleError(error, operation);
    }
  }

  /**
   * Log service operation for debugging
   */
  protected logOperation(operation: string, data?: unknown): void {
    debugService(
      `Service operation: ${operation}`,
      this.serviceName,
      {
        operation,
        data,
        timestamp: new Date().toISOString(),
      }
    );
  }
}

export default BaseService;