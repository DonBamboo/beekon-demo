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

/**
 * Base service class providing common functionality for all services
 */
export abstract class BaseService {
  protected abstract serviceName: ServiceError['service'];

  /**
   * Handle and transform errors into consistent AppError format
   */
  protected handleError(error: unknown, operation?: string): AppError {
    // Service error handled

    // Handle PostgreSQL/Supabase errors
    if (this.isPostgrestError(error)) {
      return this.handleDatabaseError(error, operation);
    }

    // Handle validation errors
    if (this.isValidationError(error)) {
      return createValidationError(
        getErrorMessage(error),
        undefined,
        { constraints: [getErrorMessage(error)] }
      );
    }

    // Handle service errors
    if (error instanceof Error) {
      return createServiceError(
        error.message,
        this.serviceName,
        operation
      );
    }

    // Handle unknown errors
    return createServiceError(
      getErrorMessage(error),
      this.serviceName,
      operation
    );
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
    try {
      return await fn();
    } catch (error) {
      throw this.handleError(error, operation);
    }
  }

  /**
   * Log service operation for debugging
   */
  protected logOperation(_operation: string, _data?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      // Service operation logged
    }
  }
}

export default BaseService;