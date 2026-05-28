/**
 * Standard error classes for the ERP API.
 * All errors extend AppError for consistent error handling.
 */
export class AppError extends Error {
    statusCode;
    code;
    constructor(message, statusCode, code) {
        super(message);
        this.name = 'AppError';
        this.statusCode = statusCode;
        this.code = code;
    }
}
export class NotFoundError extends AppError {
    constructor(entity, id) {
        const message = id ? `${entity} with id '${id}' not found` : `${entity} not found`;
        super(message, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}
export class ForbiddenError extends AppError {
    constructor(message = 'Access denied') {
        super(message, 403, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}
export class UnauthorizedError extends AppError {
    constructor(message = 'Authentication required') {
        super(message, 401, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}
export class ValidationError extends AppError {
    details;
    constructor(message, details = {}) {
        super(message, 400, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
        this.details = details;
    }
}
export class ConflictError extends AppError {
    constructor(message) {
        super(message, 409, 'CONFLICT');
        this.name = 'ConflictError';
    }
}
//# sourceMappingURL=errors.js.map