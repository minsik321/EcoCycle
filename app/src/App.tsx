import AppRoutes from './routes';
import { useQualityTier } from './store/useQualityTier';
import { useRealtime } from './store/useRealtime';

export default function App() {
  useRealtime();
  useQualityTier();
  return <AppRoutes />;
}
