import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Download, FileText, UploadCloud, X } from 'lucide-react';
import { api, SAMPLE_CSV_URL } from '../api/reviewlens.js';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useHealth } from '../hooks/queries.js';
import { formatBytes } from '../utils/format.js';
import { Button } from './ui.jsx';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/** Client-side pre-check; the server validates again (type, size, header, rows). */
export function validateCsvFile(file, maxBytes = DEFAULT_MAX_BYTES) {
  if (!file) return 'Choose a CSV file.';
  if (!/\.csv$/i.test(file.name)) return 'Only .csv files are supported.';
  if (file.size === 0) return 'The file is empty.';
  if (file.size > maxBytes) return `The file is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`;
  return null;
}

/** Drag-and-drop / browse area. Sends the real file to the backend as multipart/form-data. */
export function UploadDropzone({ onUploaded }) {
  const inputRef = useRef(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const { selectDataset } = useDatasetContext();
  const maxBytes = useHealth().data?.maxUploadBytes ?? DEFAULT_MAX_BYTES;

  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);

  const choose = (candidate) => {
    setFile(candidate ?? null);
    setError(candidate ? validateCsvFile(candidate, maxBytes) : null);
  };

  const upload = async () => {
    const problem = validateCsvFile(file, maxBytes);
    if (problem) return setError(problem);
    setError(null);
    setProgress(0);
    try {
      const { dataset } = await api.uploadDataset(file, setProgress);
      queryClient.setQueryData(['datasets'], (old = []) => [dataset, ...old.filter((d) => d.id !== dataset.id)]);
      queryClient.setQueryData(['status', dataset.id], dataset);
      selectDataset(dataset.id);
      toast.success(`Uploaded ${dataset.filename}: ${dataset.counts.totalRows} rows found. Analysis started.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onUploaded?.(dataset);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;

  return (
    <div className="space-y-4">
      <label
        htmlFor="csv-file-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          choose(e.dataTransfer.files?.[0]);
        }}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 hover:bg-slate-50'
        }`}
      >
        <UploadCloud className="mb-3 size-9 text-brand-500" aria-hidden />
        <span className="text-sm font-medium text-slate-900">Drag and drop your reviews CSV here</span>
        <span className="mt-1 text-sm text-slate-500">
          or <span className="font-medium text-brand-600 underline">browse files</span> · max {formatBytes(maxBytes)}
        </span>
        <span className="mt-3 text-xs text-slate-400">Required columns: review_id, product, rating, date, review_text</span>
        <input
          id="csv-file-input"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0])}
        />
      </label>

      {file && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <FileText className="size-5 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)}</p>
          </div>
          {!uploading && (
            <button type="button" onClick={() => choose(null)} className="text-slate-400 hover:text-slate-600" aria-label="Remove file">
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>{progress < 100 ? 'Uploading…' : 'Parsing and validating on the server…'}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={SAMPLE_CSV_URL} download className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <Download className="size-4" aria-hidden /> Download sample CSV
        </a>
        <Button icon={UploadCloud} onClick={upload} loading={uploading} disabled={!file || Boolean(error)}>
          Upload and analyse
        </Button>
      </div>
    </div>
  );
}

/** Modal wrapper around the dropzone (native <dialog>: focus trap + Esc for free). */
export function UploadDialog({ open, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="upload-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-white p-0 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 id="upload-title" className="text-base font-semibold text-slate-900">
          Upload reviews
        </h2>
        <button type="button" onClick={onClose} className="rounded text-slate-400 hover:text-slate-600" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="p-5">{open && <UploadDropzone onUploaded={onClose} />}</div>
    </dialog>
  );
}
