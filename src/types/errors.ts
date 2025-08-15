// Common error types for the application

export interface BaseError {
  message: string;
  code?: string;
  timestamp?: string;
}

export interface AuthError extends BaseError {
  type: "auth";
  details?: {
    email?: string;
    provider?: string;
  };
}

export interface DatabaseError extends BaseError {
  type: "database";
  table?: string;
  operation?: "create" | "read" | "update" | "delete";
  details?: {
    constraint?: string;
    column?: string;
  };
}

export interface ValidationError extends BaseError {
  type: "validation";
  field?: string;
  details?: {
    expected?: string;
    received?: string;
    constraints?: string[];
  };
}

export interface NetworkError extends BaseError {
  type: "network";
  status?: number;
  url?: string;
  details?: {
    timeout?: boolean;
    retryable?: boolean;
  };
}

export interface ServiceError extends BaseError {
  type: "service";
  service:
    | "profile"
    | "workspace"
    | "website"
    | "analysis"
    | "api-key"
    | "dashboard"
    | "competitor";
  operation?: string;
}

export interface UnknownError extends BaseError {
  type: "unknown";
  status: number;
}

export type AppError =
  | AuthError
  | DatabaseError
  | ValidationError
  | NetworkError
  | ServiceError
  | UnknownError;

// Error factory functions
export const createAuthError = (
  message: string,
  details?: AuthError["details"]
): AuthError => ({
  type: "auth",
  message,
  details,
  timestamp: new Date().toISOString(),
});

export const createDatabaseError = (
  message: string,
  table?: string,
  operation?: DatabaseError["operation"],
  details?: DatabaseError["details"]
): DatabaseError => ({
  type: "database",
  message,
  table,
  operation,
  details,
  timestamp: new Date().toISOString(),
});

export const createValidationError = (
  message: string,
  field?: string,
  details?: ValidationError["details"]
): ValidationError => ({
  type: "validation",
  message,
  field,
  details,
  timestamp: new Date().toISOString(),
});

export const createNetworkError = (
  message: string,
  status?: number,
  url?: string,
  details?: NetworkError["details"]
): NetworkError => ({
  type: "network",
  message,
  status,
  url,
  details,
  timestamp: new Date().toISOString(),
});

export const createServiceError = (
  message: string,
  service: ServiceError["service"],
  operation?: string
): ServiceError => ({
  type: "service",
  message,
  service,
  operation,
  timestamp: new Date().toISOString(),
});

// Type guards
export const isAuthError = (error: AppError): error is AuthError =>
  error.type === "auth";
export const isDatabaseError = (error: AppError): error is DatabaseError =>
  error.type === "database";
export const isValidationError = (error: AppError): error is ValidationError =>
  error.type === "validation";
export const isNetworkError = (error: AppError): error is NetworkError =>
  error.type === "network";
export const isServiceError = (error: AppError): error is ServiceError =>
  error.type === "service";
export const isUnknownError = (error: AppError): error is UnknownError =>
  error.type === "unknown";

// Error message helpers
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "An unknown error occurred";
};

export const formatErrorForUser = (error: AppError): string => {
  switch (error.type) {
    case "auth":
      return `Authentication error: ${error.message}`;
    case "database":
      return `Data error: ${error.message}`;
    case "validation":
      return `Validation error: ${error.message}`;
    case "network":
      return `Connection error: ${error.message}`;
    case "service":
      return `Service error: ${error.message}`;
    default:
      return error.message;
  }
};
