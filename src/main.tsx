import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode intentionally disabled — it double-invokes state initializers in dev
// which interferes with synchronous localStorage session reading.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
