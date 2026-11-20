import { Router } from 'express';
import { createCsvUpload, sanitizeFilename } from '../middleware/upload.js';
import { parseReviewsCsv } from '../services/csvParser.js';
import { buildDashboard, buildProductDetail, buildProductList, toDatasetDto } from '../services/insights.js';
import { HttpError } from '../utils/httpError.js';
import { DatasetParams, ProductParams, ReviewListQuery } from '../validators/requestSchemas.js';

/** /api/datasets — upload, status, dashboard, reviews and product analytics. */
export function createDatasetRoutes({ datasets, reviews, queue, config }) {
  const router = Router();
  const upload = createCsvUpload(config.maxUploadBytes);

  const loadDataset = (params) => {
    const { datasetId } = DatasetParams.parse(params);
    const dataset = datasets.get(datasetId);
    if (!dataset) throw new HttpError(404, 'NOT_FOUND', 'Dataset not found.');
    return dataset;
  };

  // Upload a CSV: parse + clean synchronously (fast), analyse in the background.
  router.post('/', upload, (req, res) => {
    if (!req.file) throw new HttpError(400, 'NO_FILE', 'Attach a CSV file in the "file" form field.');
    const parsed = parseReviewsCsv(req.file.buffer, { maxRows: config.maxCsvRows });

    const datasetId = datasets.create(sanitizeFilename(req.file.originalname));
    reviews.insertParsedRows(datasetId, parsed.rows);
    datasets.refreshCounts(datasetId);
    queue.enqueue(datasetId);

    res.status(202).json({ data: { dataset: toDatasetDto(datasets.get(datasetId)), parseStats: parsed.stats } });
  });

  router.get('/', (_req, res) => {
    res.json({ data: datasets.list().map(toDatasetDto) });
  });

  router.get('/:datasetId/status', (req, res) => {
    res.json({ data: toDatasetDto(loadDataset(req.params)) });
  });

  router.get('/:datasetId/dashboard', (req, res) => {
    const dataset = loadDataset(req.params);
    res.json({ data: buildDashboard(dataset, reviews.allForDataset(dataset.id)) });
  });

  router.get('/:datasetId/reviews', (req, res) => {
    const dataset = loadDataset(req.params);
    const filters = ReviewListQuery.parse(req.query);
    res.json({
      data: {
        ...reviews.list(dataset.id, filters),
        // Facets so the UI can build its filter dropdowns from real data.
        products: reviews.productNames(dataset.id),
      },
    });
  });

  router.get('/:datasetId/products', (req, res) => {
    const dataset = loadDataset(req.params);
    res.json({ data: buildProductList(reviews.allForDataset(dataset.id)) });
  });

  router.get('/:datasetId/products/:productId', (req, res) => {
    const { datasetId, productId } = ProductParams.parse(req.params);
    const dataset = loadDataset({ datasetId });
    const detail = buildProductDetail(productId, reviews.allForDataset(dataset.id));
    if (!detail) throw new HttpError(404, 'NOT_FOUND', 'Product not found in this dataset.');
    res.json({ data: detail });
  });

  // Re-queue reviews whose analysis failed (e.g. after fixing the API key).
  router.post('/:datasetId/retry-failed', (req, res) => {
    const dataset = loadDataset(req.params);
    if (['queued', 'processing'].includes(dataset.status)) {
      throw new HttpError(409, 'BUSY', 'This dataset is still being processed.');
    }
    const requeued = reviews.resetFailed(dataset.id);
    if (requeued > 0) {
      datasets.refreshCounts(dataset.id);
      datasets.markQueued(dataset.id);
      queue.enqueue(dataset.id);
    }
    res.status(202).json({ data: { requeued, dataset: toDatasetDto(datasets.get(dataset.id)) } });
  });

  return router;
}
