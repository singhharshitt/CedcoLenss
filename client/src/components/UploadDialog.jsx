import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileText, UploadCloud, X } from 'lucide-react';
import { api, SAMPLE_CSV_URL } from '../api/reviewlens.js';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useHealth } from '../hooks/queries.js';
import { formatBytes } from '../utils/format.js';
import { Button } from './ui.jsx';
import { WaveLines } from './waves.jsx';

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
        className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 pb-14 pt-10 text-center transition-[border-color,background-color,box-shadow] duration-200 focus-within:ring-2 focus-within:ring-navy-600 focus-within:ring-offset-2 ${
          dragging
            ? 'border-brand-500 bg-brand-100 shadow-md'
            : 'border-navy-300 bg-cream hover:border-navy-600 hover:bg-brand-50'
        }`}
      >
        <WaveLines drift={dragging} className={dragging ? 'text-brand-500' : 'text-navy-300'} />
        <span
          className={`relative mb-4 flex size-14 items-center justify-center rounded-2xl transition-[background-color,transform] duration-200 ${
            dragging ? 'scale-105 bg-brand-400 text-navy-900' : 'bg-brand-300 text-navy-900 group-hover:-translate-y-0.5'
          }`}
        >
          <UploadCloud className="size-7" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="display relative text-2xl uppercase text-navy-900">{dragging ? 'Drop to upload' : 'Drop your reviews CSV'}</span>
        <span className="relative mt-2 text-sm text-slate-600">
          or <span className="font-semibold text-brand-600 underline decoration-brand-300 underline-offset-4">browse files</span> · max {formatBytes(maxBytes)}
        </span>
        <span className="relative mt-3 text-xs text-slate-500">Required columns: review_id, product, rating, date, review_text</span>
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
        <div
          className={`flex animate-rise items-center gap-3 rounded-xl border px-4 py-3 ${
            error ? 'border-rose-200 bg-rose-50' : 'border-navy-200 bg-white'
          }`}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-cream">
            <FileText className="size-4.5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
            <p className="text-xs text-slate-500">
              {formatBytes(file.size)} · {file.type || 'text/csv'}
              {file.lastModified ? ` · modified ${new Date(file.lastModified).toLocaleDateString()}` : ''}
            </p>
          </div>
          {!error && !uploading && <CheckCircle2 className="size-4.5 shrink-0 text-emerald-600" aria-label="Ready to upload" />}
          {!uploading && (
            <button type="button" onClick={() => choose(null)} className="text-slate-400 hover:text-slate-600" aria-label="Remove file">
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {uploading && (
        <div>
          <div className="mb-1.5 flex justify-between text-xs font-medium text-slate-600">
            <span>{progress < 100 ? 'Uploading…' : 'Parsing and validating on the server…'}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div className="h-full rounded-full bg-navy-700 transition-[width] duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={SAMPLE_CSV_URL} download className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
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
      className="m-auto w-[calc(100%-2rem)] max-w-lg animate-rise overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 px-6 py-4">
        <div>
          <p className="eyebrow text-brand-700">New analysis</p>
          <h2 id="upload-title" className="display mt-1 text-2xl uppercase text-navy-900">
            Upload reviews
          </h2>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className="p-6">{open && <UploadDropzone onUploaded={onClose} />}</div>
    </dialog>
  );
}
