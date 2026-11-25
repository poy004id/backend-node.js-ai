'use strict';

class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    if (this.details && typeof this.details === 'object') {
      return {
        message: this.message,
        ...this.details,
      };
    }
    return { message: this.message };
  }
}

module.exports = AppError;

