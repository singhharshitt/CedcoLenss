import { CheckCircle2, Eye, PlugZap, RotateCw, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useDatasetContext } from '../context/DatasetContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { useHealth, useRetryFailed, useTestLlm } from '../hooks/queries.js';
import { formatBytes, formatDateTime, formatDuration, isActiveStatus } from '../utils/format.js';
import { Button, Card, EmptyState, ErrorState, LoadingState, StatusBadge } from '../components/ui.jsx';

function HealthRow({ label, ok, detail }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-slate-700">{label}</span>
      <span className={`flex items-center gap-1.5 text-sm font-medium ${ok ? 'text-emerald-700' : 'text-rose-700'}`}>
        {ok ? <CheckCircle2 className="size-4" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
        {detail}
      </span>
    </div>
  );
}

/** "Test AI connection": one real request per provider, showing latency or the provider's error. */
function ConnectionTest() {
  const test = useTestLlm();
  const results = test.data?.results;
  return (
    <div className="pt-3">
      <Button variant="secondary" size="sm" icon={PlugZap} loading={test.isPending} onClick={() => test.mutate()}>
        {test.isPending ? 'Testing…' : 'Test AI connection'}
      </Button>
      {test.isError && <p className="mt-2 text-xs text-rose-700">{test.error.message}</p>}
      {results && (
        <ul className="mt-3 space-y-2" aria-label="Connection test results">
          {results.map((r) => (
            <li
              key={r.role}
              className={`rounded-lg border px-3 py-2 text-xs ${r.ok ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 font-medium ${r.ok ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {r.ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <XCircle className="size-3.5" aria-hidden />}
                  {r.role === 'primary' ? 'Primary' : 'Fallback'}: {r.model ?? 'not set'}
                </span>
                {r.latencyMs != null && <span className="tabular-nums text-slate-600">{(r.latencyMs / 1000).toFixed(1)} s</span>}
              </div>
              {r.host && <p className="mt-0.5 text-slate-500">{r.host}</p>}
              {!r.ok && r.error && <p className="mt-1 break-words text-rose-700">{r.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ENV_VARS = [
  ['LLM_API_KEY', 'API key for the provider (server only, never sent to the browser). Optional for a local Ollama.'],
  ['LLM_BASE_URL', 'OpenAI-compatible base URL, e.g. https://api.groq.com/openai/v1'],
  ['LLM_MODEL', 'Model ID, e.g. llama-3.1-8b-instant'],
  ['LLM_API_KEY2 / LLM_BASE_URL2 / LLM_MODEL2', 'Optional fallback provider (NVIDIA by default), used when the primary times out or fails'],
  ['ANALYSIS_BATCH_SIZE', 'Reviews per LLM request (default 5)'],
  ['LLM_MAX_RETRIES', 'Network / rate-limit retries with exponential backoff (default 4)'],
];

export function SettingsPage() {
  const health = useHealth();
  const { datasets, selectedId, selectDataset } = useDatasetContext();
  const retry = useRetryFailed();
  const toast = useToast();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">System status, AI configuration and upload history.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="System status" description="Live from GET /api/health">
          {health.isLoading ? (
            <LoadingState />
          ) : health.isError ? (
            <ErrorState error={health.error} onRetry={health.refetch} />
          ) : (
            <div className="divide-y divide-slate-100">
              <HealthRow label="API server" ok detail="Reachable" />
              <HealthRow label="Database (SQLite)" ok={health.data.database === 'ok'} detail={health.data.database === 'ok' ? 'Connected' : 'Error'} />
              <HealthRow
                label="AI provider"
                ok={health.data.llm.configured}
                detail={health.data.llm.configured ? health.data.llm.model : 'Not configured'}
              />
              {health.data.llm.fallbackModel && (
                <HealthRow label="Fallback AI provider" ok detail={health.data.llm.fallbackModel} />
              )}
              <div className="flex justify-between py-2.5 text-sm">
                <span className="text-slate-700">Batch size</span>
                <span className="font-medium text-slate-900">{health.data.batchSize} reviews / request</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="text-slate-700">Max upload size</span>
                <span className="font-medium text-slate-900">{formatBytes(health.data.maxUploadBytes)}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="text-slate-700">Cached analyses</span>
                <span className="font-medium text-slate-900">{health.data.cachedAnalyses}</span>
              </div>
              <ConnectionTest />
            </div>
          )}
        </Card>

        <Card title="AI configuration" description="Set in the server's .env file (see .env.example), then restart the server">
          <dl className="space-y-3">
            {ENV_VARS.map(([name, description]) => (
              <div key={name}>
                <dt className="font-mono text-xs font-semibold text-slate-900">{name}</dt>
                <dd className="text-sm text-slate-600">{description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            For security these values cannot be edited from the browser. The key stays on the server and all AI requests go through the backend.
          </p>
        </Card>
      </div>

      <Card title="Upload history" description="Every dataset processed by this server">
        {datasets.length === 0 ? (
          <EmptyState title="No uploads yet" />
        ) : (
          <div className="relative -mx-5 -my-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {['Dataset', 'Uploaded', 'Status', 'Rows', 'Analysed', 'Failed', 'AI calls', 'Cache hits', 'Time', ''].map((h) => (
                    <th key={h} scope="col" className="px-4 py-2.5 font-medium">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {datasets.map((d) => (
                  <tr key={d.id} className={d.id === selectedId ? 'bg-brand-50/40' : ''}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      #{d.id} · {d.filename}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(d.createdAt)}</td>
                    <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-4 py-3 tabular-nums">{d.counts.totalRows}</td>
                    <td className="px-4 py-3 tabular-nums">{d.counts.analysed}</td>
                    <td className="px-4 py-3 tabular-nums">{d.counts.failed}</td>
                    <td className="px-4 py-3 tabular-nums">{d.counts.aiCalls}</td>
                    <td className="px-4 py-3 tabular-nums">{d.counts.cacheHits}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDuration(d.processingTimeMs)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {d.counts.failed > 0 && !isActiveStatus(d.status) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={RotateCw}
                            loading={retry.isPending && retry.variables === d.id}
                            onClick={() =>
                              retry.mutate(d.id, {
                                onSuccess: (r) => toast.success(`Re-queued ${r.requeued} review(s).`),
                                onError: (e) => toast.error(e.message),
                              })
                            }
                          >
                            Retry failed
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          icon={Eye}
                          onClick={() => {
                            selectDataset(d.id);
                            navigate('/');
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
