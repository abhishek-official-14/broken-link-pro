import { useState, useEffect, useRef } from 'react';
import './App.css';
import { Activity, Globe, AlertCircle, CheckCircle, Clock, Download, Search, XCircle } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [url, setUrl] = useState('');
  const [maxDepth, setMaxDepth] = useState(2);
  const [maxPages, setMaxPages] = useState(100);
  const [timeout, setTimeout] = useState(10000);
  const [rateLimit, setRateLimit] = useState(500);
  const [crawling, setCrawling] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [currentUrl, setCurrentUrl] = useState('');
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({ total: 0, broken: 0, pages: 0 });
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('status');
  const logRef = useRef(null);
  const pollInterval = useRef(null);

  const startCrawl = async () => {
    if (!url) return;

    setCrawling(true);
    setProgress(0);
    setResults([]);
    setStatus('Starting crawl...');

    try {
      const response = await fetch(`${API}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, maxDepth, maxPages, timeout, rateLimit })
      });

      const data = await response.json();
      setJobId(data.jobId);
      setStatus('Crawling in progress...');
      
      pollInterval.current = setInterval(() => pollJobStatus(data.jobId), 1000);
    } catch (error) {
      setStatus('Error starting crawl');
      setCrawling(false);
    }
  };

  const pollJobStatus = async (id) => {
    try {
      const response = await fetch(`${API}/crawl/${id}`);
      const data = await response.json();

      setProgress(data.progress || 0);
      setCurrentUrl(data.currentUrl || '');
      setResults(data.links || []);
      setStats({
        total: data.totalLinks || 0,
        broken: data.brokenLinks || 0,
        pages: data.pagesProcessed || 0
      });

      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(pollInterval.current);
        setCrawling(false);
        setStatus(data.status === 'completed' ? 'Crawl completed!' : 'Crawl failed');
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  };

  const stopCrawl = () => {
    clearInterval(pollInterval.current);
    setCrawling(false);
    setStatus('Crawl stopped');
  };

  const downloadFile = async (format) => {
    if (!jobId) return;
    window.open(`${API}/export/${jobId}/${format}`, '_blank');
  };

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentUrl, results.length]);

  const filteredResults = results
    .filter(link => {
      if (filter === 'broken') return link.broken;
      if (filter === 'working') return !link.broken;
      if (filter === 'internal') return link.type === 'internal';
      if (filter === 'external') return link.type === 'external';
      return true;
    })
    .filter(link => link.url.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'status') return b.status - a.status;
      if (sortBy === 'time') return b.responseTime - a.responseTime;
      return 0;
    });

  const getStatusIcon = (link) => {
    if (link.status === 0) return <XCircle className="status-icon error" />;
    if (link.status >= 400) return <AlertCircle className="status-icon error" />;
    if (link.status >= 300) return <Activity className="status-icon warning" />;
    return <CheckCircle className="status-icon success" />;
  };

  const getStatusClass = (status) => {
    if (status === 0 || status >= 400) return 'status-error';
    if (status >= 300) return 'status-warning';
    return 'status-success';
  };

  return (
    <div className="app" data-testid="link-crawler-app">
      <div className="scanline"></div>
      
      <header className="header">
        <div className="header-content">
          <Globe className="logo-icon" />
          <h1 className="title" data-testid="app-title">LINKSPIDER PRO</h1>
          <div className="subtitle">WEBSITE LINK CRAWLER & BROKEN LINK DETECTOR</div>
        </div>
      </header>

      <main className="main-content">
        <div className="config-panel" data-testid="config-panel">
          <div className="panel-header">MISSION CONTROL</div>
          
          <div className="form-group">
            <label data-testid="url-input-label">TARGET URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={crawling}
              data-testid="url-input"
              className="input-field"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label data-testid="depth-label">DEPTH (1-3)</label>
              <input
                type="number"
                value={maxDepth}
                onChange={(e) => setMaxDepth(Math.min(3, Math.max(1, parseInt(e.target.value) || 1)))}
                min="1"
                max="3"
                disabled={crawling}
                data-testid="depth-input"
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label data-testid="max-pages-label">MAX PAGES</label>
              <input
                type="number"
                value={maxPages}
                onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
                disabled={crawling}
                data-testid="max-pages-input"
                className="input-field"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label data-testid="timeout-label">TIMEOUT (ms)</label>
              <input
                type="number"
                value={timeout}
                onChange={(e) => setTimeout(parseInt(e.target.value) || 10000)}
                disabled={crawling}
                data-testid="timeout-input"
                className="input-field"
              />
            </div>
            <div className="form-group">
              <label data-testid="rate-limit-label">RATE LIMIT (ms)</label>
              <input
                type="number"
                value={rateLimit}
                onChange={(e) => setRateLimit(parseInt(e.target.value) || 500)}
                disabled={crawling}
                data-testid="rate-limit-input"
                className="input-field"
              />
            </div>
          </div>

          <button
            onClick={crawling ? stopCrawl : startCrawl}
            disabled={!url && !crawling}
            className={`btn-primary ${crawling ? 'btn-stop' : ''}`}
            data-testid="crawl-button"
          >
            {crawling ? 'STOP CRAWL' : 'START CRAWL'}
          </button>
        </div>

        <div className="stats-grid" data-testid="stats-grid">
          <div className="stat-card">
            <Globe className="stat-icon" />
            <div className="stat-value" data-testid="total-links-stat">{stats.total}</div>
            <div className="stat-label">TOTAL LINKS</div>
          </div>
          <div className="stat-card">
            <AlertCircle className="stat-icon error-pulse" />
            <div className="stat-value error-text" data-testid="broken-links-stat">{stats.broken}</div>
            <div className="stat-label">BROKEN LINKS</div>
          </div>
          <div className="stat-card">
            <Activity className="stat-icon" />
            <div className="stat-value" data-testid="pages-processed-stat">{stats.pages}</div>
            <div className="stat-label">PAGES PROCESSED</div>
          </div>
        </div>

        {crawling && (
          <div className="progress-section" data-testid="progress-section">
            <div className="progress-header">
              <Clock className="progress-icon" />
              <span className="progress-label">CRAWL IN PROGRESS</span>
              <span className="progress-percent" data-testid="progress-percent">{Math.round(progress)}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }}></div>
            </div>
            {currentUrl && (
              <div className="current-url" data-testid="current-url">
                <span className="url-label">SCANNING:</span>
                <span className="url-text">{currentUrl}</span>
              </div>
            )}
          </div>
        )}

        {results.length > 0 && (
          <div className="terminal-log" ref={logRef} data-testid="terminal-log">
            <div className="terminal-header">LIVE TERMINAL LOG</div>
            <div className="terminal-content">
              {results.slice(-10).map((link, index) => (
                <div key={index} className="terminal-line" data-testid={`terminal-line-${index}`}>
                  <span className={getStatusClass(link.status)}>[{link.status || '000'}]</span>
                  <span className="terminal-url">{link.url}</span>
                  <span className="terminal-time">{link.responseTime}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="results-section" data-testid="results-section">
            <div className="results-header">
              <h2 className="results-title">RESULTS DATA GRID</h2>
              <div className="results-actions">
                <button onClick={() => downloadFile('csv')} className="btn-export" data-testid="export-csv-btn">
                  <Download size={16} /> CSV
                </button>
                <button onClick={() => downloadFile('json')} className="btn-export" data-testid="export-json-btn">
                  <Download size={16} /> JSON
                </button>
              </div>
            </div>

            <div className="filter-bar" data-testid="filter-bar">
              <div className="search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search URLs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                  data-testid="search-input"
                />
              </div>
              <div className="filter-buttons">
                <button onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''} data-testid="filter-all">ALL</button>
                <button onClick={() => setFilter('broken')} className={filter === 'broken' ? 'active' : ''} data-testid="filter-broken">BROKEN</button>
                <button onClick={() => setFilter('working')} className={filter === 'working' ? 'active' : ''} data-testid="filter-working">WORKING</button>
                <button onClick={() => setFilter('internal')} className={filter === 'internal' ? 'active' : ''} data-testid="filter-internal">INTERNAL</button>
                <button onClick={() => setFilter('external')} className={filter === 'external' ? 'active' : ''} data-testid="filter-external">EXTERNAL</button>
              </div>
              <select onChange={(e) => setSortBy(e.target.value)} className="sort-select" data-testid="sort-select">
                <option value="status">SORT BY STATUS</option>
                <option value="time">SORT BY TIME</option>
              </select>
            </div>

            <div className="results-table-wrapper">
              <table className="results-table" data-testid="results-table">
                <thead>
                  <tr>
                    <th>STATUS</th>
                    <th>URL</th>
                    <th>TYPE</th>
                    <th>TIME</th>
                    <th>SOURCE</th>
                    <th>DEPTH</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((link, index) => (
                    <tr key={index} className={link.broken ? 'row-error' : ''} data-testid={`result-row-${index}`}>
                      <td data-testid={`result-status-${index}`}>
                        <div className="status-cell">
                          {getStatusIcon(link)}
                          <span className={getStatusClass(link.status)}>{link.status || '000'}</span>
                        </div>
                      </td>
                      <td className="url-cell" data-testid={`result-url-${index}`}>{link.url}</td>
                      <td data-testid={`result-type-${index}`}>
                        <span className={`badge badge-${link.type}`}>{link.type}</span>
                      </td>
                      <td data-testid={`result-time-${index}`}>{link.responseTime}ms</td>
                      <td className="source-cell" data-testid={`result-source-${index}`}>{link.source}</td>
                      <td data-testid={`result-depth-${index}`}>{link.depth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;