const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  const { statusCode = 500, message, code } = err;

  // Log error
  logger.error({
    error: err,
    request: req.url,
    method: req.method,
    ip: req.ip,
    statusCode,
  });

  // Don't leak error details in production
  let errorMessage = message;
  if (process.env.NODE_ENV === 'production' && statusCode === 500) {
    errorMessage = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message: errorMessage,
      code: code || 'ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = errorHandler;
