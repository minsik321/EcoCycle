import { Route, Routes } from 'react-router-dom';

// 화면(features)이 생기면 여기에 라우트를 추가한다.
export default function AppRoutes() {
  return (
    <Routes>
      <Route path="*" element={<div className="p-6 text-lg">EcoCycle</div>} />
    </Routes>
  );
}
