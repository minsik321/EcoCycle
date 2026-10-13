import AppRoutes from './routes';
import { useRealtime } from './store/useRealtime';

export default function App() {
  useRealtime();
  return <AppRoutes />;
}
