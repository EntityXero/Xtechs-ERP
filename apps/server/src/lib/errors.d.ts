/**
 * Standard error classes for the ERP API.
 * All errors extend AppError for consistent error handling.
 */
export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    constructor(message: string, statusCode: number, code: string);
}
export declare class NotFoundError extends AppError {
    constructor(entity: string, id?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ValidationError extends AppError {
    readonly details: Record<string, string[]>;
    constructor(message: string, details?: Record<string, string[]>);
}
export declare class ConflictError extends AppError {
    constructor(message: string);
}
//# sourceMappingURL=errors.d.ts.map