import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateDataset, useDatasetStatus, useDatasets } from '../hooks/queries.js';
import { isActiveStatus } from '../utils/format.js';

const STORAGE_KEY = 'reviewlens.selectedDataset';
const DatasetContext = createContext(null);

function readStoredId() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * Which dataset the whole app is looking at. The choice survives page refreshes
 * (localStorage); if it no longer exists we fall back to the newest upload.
 * While that dataset is processing, its status is polled and `isProcessing` lets
 * pages poll their data too. When processing ends every view is refreshed.
 */
export function DatasetProvider({ children }) {
  const queryClient = useQueryClient();
  const datasetsQuery = useDatasets();
  const [storedId, setStoredId] = useState(readStoredId);

  const datasets = useMemo(() => datasetsQuery.data ?? [], [datasetsQuery.data]);
  const selectedId = datasets.some((d) => d.id === storedId) ? storedId : (datasets[0]?.id ?? null);
  const statusQuery = useDatasetStatus(selectedId);
  const status = statusQuery.data ?? datasets.find((d) => d.id === selectedId) ?? null;
  const isProcessing = isActiveStatus(status?.status);

  // Processing just finished -> refresh dashboard, tables and product views once.
  const wasProcessing = useRef(false);
  useEffect(() => {
    if (wasProcessing.current && !isProcessing && selectedId != null) invalidateDataset(queryClient, selectedId);
    wasProcessing.current = isProcessing;
  }, [isProcessing, selectedId, queryClient]);

  const value = useMemo(
    () => ({
      datasets,
      datasetsLoading: datasetsQuery.isLoading,
      datasetsError: datasetsQuery.error,
      selectedId,
      dataset: status,
      isProcessing,
      selectDataset(id) {
        setStoredId(id);
        try {
          localStorage.setItem(STORAGE_KEY, String(id));
        } catch {
          /* storage unavailable: selection just won't persist */
        }
      },
    }),
    [datasets, datasetsQuery.isLoading, datasetsQuery.error, selectedId, status, isProcessing],
  );

  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDatasetContext() {
  const ctx = useContext(DatasetContext);
  if (!ctx) throw new Error('useDatasetContext must be used inside DatasetProvider');
  return ctx;
}
