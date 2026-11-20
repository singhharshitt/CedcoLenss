import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { CsvValidationError } from '../services/csvParser.js';
import { describeZodError } from '../validators/analysisSchema.js';

/** 404 for unknown /api routes. */
export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

/**
 * Central error handler: every error becomes `{ error: { code, message } }`.
 * Known errors keep their message; anything unexpected is logged on the server
 * and returned as a generic 500 (no stack traces or secrets reach the client).
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: describeZodError(err) } });
  }
  if (err instanceof CsvValidationError) {
    return res.status(400).json({ error: { code: 'INVALID_CSV', message: err.message } });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large.' : `Upload error: ${err.message}`;
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: { code: 'UPLOAD_ERROR', message } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
}
