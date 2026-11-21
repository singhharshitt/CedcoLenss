import { Link, Route, Routes } from 'react-router';
import { AppLayout } from './components/AppLayout.jsx';
import { EmptyState } from './components/ui.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { ReviewsPage } from './pages/ReviewsPage.jsx';
import { ProductDetailPage, ProductsPage } from './pages/ProductsPage.jsx';
import { InsightsPage } from './pages/InsightsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { ReportPage } from './pages/ReportPage.jsx';

function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="This page does not exist."
      action={<Link to="/" className="text-sm font-medium text-brand-600">Back to overview</Link>}
    />
  );
}

export default function App() {
  return (
    <Routes>
      {/* Printable report: no sidebar / header, opened in its own tab. */}
      <Route path="report/:datasetId" element={<ReportPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:productId" element={<ProductDetailPage />} />
        <Route path="insights" element={<InsightsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
