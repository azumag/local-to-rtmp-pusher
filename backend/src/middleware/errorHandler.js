const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message, code } = err;

  // Log error
  logger.error({
    error: err,
    request: req.url,
    method: req.method,
    ip: req.ip,
    statusCode
  });

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code: code || 'ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = errorHandler;