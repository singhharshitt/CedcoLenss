import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/reviewlens.js';
import { isActiveStatus } from '../utils/format.js';

/** React Query hooks: one per backend resource. `live` = keep polling while a dataset is processing. */

export const useHealth = () => useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 30000 });

export const useDatasets = () =>
  useQuery({
    queryKey: ['datasets'],
    queryFn: api.listDatasets,
    refetchInterval: (query) => (query.state.data?.some((d) => isActiveStatus(d.status)) ? 3000 : false),
  });

export const useDatasetStatus = (id) =>
  useQuery({
    queryKey: ['status', id],
    queryFn: () => api.datasetStatus(id),
    enabled: id != null,
    refetchInterval: (query) => (isActiveStatus(query.state.data?.status) ? 1000 : false),
  });

export const useDashboard = (id, live) =>
  useQuery({
    queryKey: ['dashboard', id],
    queryFn: () => api.dashboard(id),
    enabled: id != null,
    refetchInterval: live ? 2000 : false,
  });

export const useReviews = (id, filters, live) =>
  useQuery({
    queryKey: ['reviews', id, filters],
    queryFn: () => api.reviews(id, filters),
    enabled: id != null,
    placeholderData: keepPreviousData,
    refetchInterval: live ? 3000 : false,
  });

export const useProducts = (id, live) =>
  useQuery({
    queryKey: ['products', id],
    queryFn: () => api.products(id),
    enabled: id != null,
    refetchInterval: live ? 3000 : false,
  });

export const useProduct = (id, productId, live) =>
  useQuery({
    queryKey: ['product', id, productId],
    queryFn: () => api.product(id, productId),
    enabled: id != null && Boolean(productId),
    refetchInterval: live ? 3000 : false,
  });

/** Generates (or reuses) a suggested reply and refreshes cached review lists. */
export function useGenerateReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, regenerate }) => api.generateReply(reviewId, regenerate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/** Saves a reply edited by hand (no AI call). */
export function useSaveReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, reply }) => api.saveReply(reviewId, reply),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      queryClient.invalidateQueries({ queryKey: ['product'] });
    },
  });
}

/** AI themes; polled while they are being generated or the dataset is still processing. */
export const useThemes = (id, live) =>
  useQuery({
    queryKey: ['themes', id],
    queryFn: () => api.themes(id),
    enabled: id != null,
    refetchInterval: (query) => (live || query.state.data?.status === 'generating' ? 2000 : false),
  });

export function useRegenerateThemes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datasetId) => api.regenerateThemes(datasetId),
    onSuccess: (data, datasetId) => queryClient.setQueryData(['themes', datasetId], data),
  });
}

/** Sends one tiny real request to each configured AI provider. */
export const useTestLlm = () => useMutation({ mutationFn: api.testLlm });

export function useRetryFailed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datasetId) => api.retryFailed(datasetId),
    onSuccess: (_data, datasetId) => {
      queryClient.invalidateQueries({ queryKey: ['status', datasetId] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
    },
  });
}

/** Refreshes every dataset-scoped query (after processing finishes or a new upload). */
export function invalidateDataset(queryClient, id) {
  for (const key of ['status', 'dashboard', 'reviews', 'products', 'product', 'themes']) {
    queryClient.invalidateQueries({ queryKey: [key, id] });
  }
  queryClient.invalidateQueries({ queryKey: ['datasets'] });
  queryClient.invalidateQueries({ queryKey: ['health'] });
}
