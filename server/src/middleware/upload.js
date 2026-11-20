import multer from 'multer';
import { HttpError } from '../utils/httpError.js';

/**
 * Accepts a single CSV file in memory (never written to disk, so a crafted
 * filename cannot touch the filesystem). Content is validated by the parser.
 */
export function createCsvUpload(maxBytes) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(_req, file, cb) {
      if (!/\.csv$/i.test(file.originalname)) {
        return cb(new HttpError(400, 'INVALID_FILE_TYPE', 'Only .csv files are accepted.'));
      }
      cb(null, true);
    },
  }).single('file');
}

/** Display-only filename: strip any path and control characters, cap the length. */
export function sanitizeFilename(name) {
  const base = name.split(/[\\/]/).pop() ?? 'upload.csv';
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 120) || 'upload.csv';
}
