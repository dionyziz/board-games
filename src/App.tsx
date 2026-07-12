import { HashRouter, Routes, Route } from 'react-router-dom';
import Gallery from './routes/Gallery';
import Detail from './routes/Detail';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Gallery />} />
        <Route path="/game/:slug" element={<Detail />} />
      </Routes>
    </HashRouter>
  );
}
