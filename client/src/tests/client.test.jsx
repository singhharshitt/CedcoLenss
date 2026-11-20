import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError, apiRequest } from '../api/client.js';
import { toQuery } from '../api/reviewlens.js';
import { validateCsvFile } from '../components/UploadDialog.jsx';
import { ReplyPanel } from '../components/ReplyPanel.jsx';
import { ReviewDrawer } from '../components/ReviewDrawer.jsx';

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
