import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, apiRequest, messageForStatus, resolveApiBase } from '../api/client.js';
import { errorTitle } from '../components/ui.jsx';
import { toQuery } from '../api/reviewlens.js';
import { validateCsvFile } from '../components/UploadDialog.jsx';
import { ReplyPanel } from '../components/ReplyPanel.jsx';
import { ReviewDrawer } from '../components/ReviewDrawer.jsx';
import { LiveBatch } from '../components/ProcessingPanel.jsx';
import { CallsByModel, ThemeGroups } from '../components/aiThemes.jsx';
import { MemoryRouter } from 'react-router';

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function withQueryClient(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const baseReview = {
  id: 7,
  reviewId: 'R012',
  product: 'Wireless Earbuds X2',
  rating: 1,
  rawRating: '1',
  date: '2026-10-03',
  originalDate: '2026-10-03',
  rowNumber: 12,
  reviewText: 'The left earbud stopped working after 2 days.',
  status: 'analysed',
  sentiment: 'negative',
  topics: ['quality'],
  summary: 'The left earbud stopped working after two days.',
  needsReply: true,
  suggestedReply: null,
  analysisSource: 'ai',
  isDuplicate: false,
  duplicateOf: null,
  dataIssues: [],
  ratingMismatch: false,
};

beforeEach(() => {
  vi.restoreAllMocks();
  // jsdom has no <dialog> methods.
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.open = false;
  };
});

describe('API client', () => {
  it('returns the data envelope on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: { ok: true } }));
    await expect(apiRequest('/api/health')).resolves.toEqual({ ok: true });
  });

  it('turns non-2xx responses into ApiError with the server message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { code: 'INVALID_CSV', message: 'Missing required column(s): rating' } }, 400),
    );
    const error = await apiRequest('/api/datasets').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: 'INVALID_CSV', message: 'Missing required column(s): rating' });
  });

  it('reports an unreachable backend clearly', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(apiRequest('/api/health')).rejects.toThrow(/Cannot reach the ReviewLens server/);
  });

  it('builds query strings without empty filters', () => {
    expect(toQuery({ product: 'Mug', sentiment: '', topic: undefined, page: 2 })).toBe('product=Mug&page=2');
  });
});

describe('upload validation', () => {
  it('accepts a CSV and rejects other types, empty and oversized files', () => {
    expect(validateCsvFile(new File(['a'], 'reviews.csv'))).toBeNull();
    expect(validateCsvFile(new File(['a'], 'reviews.xlsx'))).toMatch(/Only \.csv/);
    expect(validateCsvFile(new File([], 'empty.csv'))).toMatch(/empty/);
    expect(validateCsvFile(new File(['abcdef'], 'big.csv'), 3)).toMatch(/limit/);
  });
});

describe('suggested replies', () => {
  it('generates a reply only when clicked, shows it and lets the user copy it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: { reply: 'We are sorry your left earbud stopped working.', reused: false } }));

    withQueryClient(<ReplyPanel review={baseReview} />);
    expect(fetchSpy).not.toHaveBeenCalled(); // nothing generated upfront

    await user.click(screen.getByRole('button', { name: /generate reply/i }));
    expect(await screen.findByText('We are sorry your left earbud stopped working.')).toBeInTheDocument();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/reviews/7/reply');
    expect(init.method).toBe('POST');

    await user.click(screen.getByRole('button', { name: /copy reply/i }));
    expect(writeText).toHaveBeenCalledWith('We are sorry your left earbud stopped working.');
    await waitFor(() => expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument());
  });

  it('shows the server error when generation fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ error: { code: 'LLM_ERROR', message: 'The AI provider could not generate a reply right now.' } }, 502),
    );
    withQueryClient(<ReplyPanel review={baseReview} />);
    await user.click(screen.getByRole('button', { name: /generate reply/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not generate a reply');
  });
});

describe('review details', () => {
  it('renders HTML-looking review text literally (no HTML injection)', () => {
    const review = { ...baseReview, reviewId: 'R024', needsReply: false, reviewText: '<b>Love it!</b> Keeps my desk clean.' };
    const { container } = withQueryClient(<ReviewDrawer review={review} onClose={() => {}} />);
    expect(screen.getByText('<b>Love it!</b> Keeps my desk clean.')).toBeInTheDocument();
    expect(container.ownerDocument.querySelector('dialog b')).toBeNull();
  });

  it('explains duplicates, invalid ratings and rating mismatches', () => {
    const review = {
      ...baseReview,
      rating: 5,
      ratingMismatch: true,
      isDuplicate: true,
      duplicateOf: 'R012',
      dataIssues: ['invalid_rating'],
      rawRating: 'five',
    };
    withQueryClient(<ReviewDrawer review={review} onClose={() => {}} />);
    expect(screen.getByText(/Same text as R012/)).toBeInTheDocument();
    expect(screen.getByText(/Rating mismatch/)).toBeInTheDocument();
    expect(screen.getByText(/Invalid rating/)).toBeInTheDocument();
  });
});

describe('LiveBatch', () => {
  const live = { batch: 3, totalBatches: 6, reviewsInBatch: 5, batchStartedAt: new Date().toISOString(), model: 'gemini-x' };

  it('shows the running batch and model', () => {
    render(<LiveBatch live={{ ...live, usingFallback: false }} />);
    expect(screen.getByText('Batch 3 of 6')).toBeInTheDocument();
    expect(screen.getByText('gemini-x')).toBeInTheDocument();
    expect(screen.queryByText(/fallback model is being used/)).not.toBeInTheDocument();
  });

  it('tells the user when the fallback provider is in use', () => {
    render(<LiveBatch live={{ ...live, model: 'nvidia/nemotron', usingFallback: true }} />);
    expect(screen.getByText(/fallback model is being used/)).toBeInTheDocument();
    expect(screen.getByText('nvidia/nemotron')).toBeInTheDocument();
  });
});

describe('ReplyPanel editing', () => {
  it('edits a reply, saves it with PUT and shows it as edited', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ data: { reply: 'Sorry! Please contact us with your order number.', edited: true } }));
    withQueryClient(<ReplyPanel review={{ ...baseReview, suggestedReply: 'Original AI reply text.' }} />);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit reply');
    expect(box).toHaveValue('Original AI reply text.');
    await user.clear(box);
    await user.type(box, 'Sorry! Please contact us with your order number.');
    await user.click(screen.getByRole('button', { name: /Save reply/ }));

    await waitFor(() => expect(screen.getByText('Edited by you')).toBeInTheDocument());
    expect(screen.getByText('Sorry! Please contact us with your order number.')).toBeInTheDocument();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/reviews/7/reply');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ reply: 'Sorry! Please contact us with your order number.' });
  });

  it('cannot save an empty reply', async () => {
    const user = userEvent.setup();
    withQueryClient(<ReplyPanel review={baseReview} />);
    await user.click(screen.getByRole('button', { name: /Write my own/ }));
    expect(screen.getByRole('button', { name: /Save reply/ })).toBeDisabled();
  });
});

describe('AI theme cards and usage table', () => {
  it('lists themes with counts, products and review ids', () => {
    render(
      <MemoryRouter>
        <ThemeGroups
          kind="complaints"
          themes={[
            {
              theme: 'Mug handles break',
              description: 'Handles come off within a week.',
              count: 2,
              reviewIds: ['R008', 'R021'],
              products: [{ name: 'Ceramic Mug', count: 2 }],
              evidence: [],
            },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Mug handles break')).toBeInTheDocument();
    expect(screen.getByText('2 reviews')).toBeInTheDocument();
    expect(screen.getByText('Ceramic Mug (2)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'R008' })).toHaveAttribute('href', '/reviews?search=R008');
  });

  it('breaks AI calls down by model', () => {
    render(
      <CallsByModel
        rows={[
          { model: 'gemini-x', purpose: 'analysis', calls: 6 },
          { model: 'nvidia/nemotron', purpose: 'analysis', calls: 2 },
        ]}
      />,
    );
    expect(screen.getByText('gemini-x')).toBeInTheDocument();
    expect(screen.getByText('nvidia/nemotron')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });
});

describe('API base URL and error handling for split deployments', () => {
  it('normalises VITE_API_BASE_URL so the /api prefix is never missing or duplicated', () => {
    expect(resolveApiBase(undefined)).toBe('');
    expect(resolveApiBase('')).toBe('');
    expect(resolveApiBase('https://cedcolens-api.onrender.com')).toBe('https://cedcolens-api.onrender.com');
    expect(resolveApiBase('https://cedcolens-api.onrender.com/')).toBe('https://cedcolens-api.onrender.com');
    expect(resolveApiBase(' https://cedcolens-api.onrender.com/api/ ')).toBe('https://cedcolens-api.onrender.com');
  });

  it('explains a non-API 404 (e.g. a static host page) instead of a bare status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('The page could not be found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
    );
    const error = await apiRequest('/api/datasets').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.url).toBe('/api/datasets');
    expect(error.message).toMatch(/API resource was not found/);
    expect(errorTitle(error)).toBe('Not found');
  });

  it('keeps the server message when the API sends its JSON error envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ error: { code: 'NOT_FOUND', message: 'Dataset not found.' } }, 404));
    await expect(apiRequest('/api/datasets/9/dashboard')).rejects.toMatchObject({ status: 404, message: 'Dataset not found.' });
  });

  it('maps every relevant status to a helpful message and title', () => {
    expect(messageForStatus(400)).toMatch(/invalid/i);
    expect(messageForStatus(422)).toMatch(/invalid/i);
    expect(messageForStatus(401)).toMatch(/not authorised/i);
    expect(messageForStatus(403)).toMatch(/forbidden/i);
    expect(messageForStatus(429)).toMatch(/too many requests/i);
    expect(messageForStatus(500)).toMatch(/server had a problem/i);
    expect(messageForStatus(503)).toMatch(/unavailable or still starting/i);
    expect(errorTitle({ status: 0 })).toBe('Cannot reach the server');
    expect(errorTitle({ status: 503 })).toBe('Backend unavailable');
    expect(errorTitle({ status: 0, code: 'TIMEOUT' })).toBe('The server is taking too long');
  });

  it('Retry in the error panel repeats the real request', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { ErrorState } = await import('../components/ui.jsx');
    render(<ErrorState error={new ApiError(messageForStatus(404), { status: 404 })} onRetry={onRetry} />);
    expect(screen.getByText('HTTP 404')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
