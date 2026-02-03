const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = 8001;

app.use(cors());
app.use(express.json());

const crawlJobs = new Map();
const CRAWL_DATA_DIR = path.join(__dirname, 'crawl_data');

fs.mkdir(CRAWL_DATA_DIR, { recursive: true }).catch(console.error);

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function normalizeUrl(urlString, baseUrl) {
  try {
    const url = new URL(urlString, baseUrl);
    url.hash = '';
    return url.href;
  } catch (e) {
    return null;
  }
}

function isSameDomain(url1, url2) {
  try {
    const domain1 = new URL(url1).hostname;
    const domain2 = new URL(url2).hostname;
    return domain1 === domain2;
  } catch (e) {
    return false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkLink(url, timeout) {
  const startTime = Date.now();
  try {
    const response = await axios.get(url, {
      timeout,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'LinkSpider-Crawler/1.0'
      }
    });
    const responseTime = Date.now() - startTime;
    return {
      status: response.status,
      statusText: response.statusText || 'OK',
      responseTime,
      broken: response.status >= 400
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    if (error.code === 'ECONNABORTED') {
      return { status: 0, statusText: 'Timeout', responseTime, broken: true };
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return { status: 0, statusText: 'Connection Failed', responseTime, broken: true };
    }
    return { status: 0, statusText: error.message, responseTime, broken: true };
  }
}

async function extractLinksFromPage(url, timeout) {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent': 'LinkSpider-Crawler/1.0'
      }
    });
    const $ = cheerio.load(response.data);
    const links = new Set();

    $('a[href]').each((_, element) => {
      const href = $(element).attr('href');
      const normalized = normalizeUrl(href, url);
      if (normalized && (normalized.startsWith('http://') || normalized.startsWith('https://'))) {
        links.add(normalized);
      }
    });

    return Array.from(links);
  } catch (error) {
    return [];
  }
}

async function crawlWebsite(jobId, startUrl, config) {
  const job = crawlJobs.get(jobId);
  const { maxDepth = 2, maxPages = 100, timeout = 10000, rateLimit = 500 } = config;

  const visitedPages = new Set();
  const discoveredLinks = new Map();
  const queue = [{ url: startUrl, depth: 0, source: 'Entry Point' }];
  
  job.status = 'running';
  job.startTime = Date.now();

  while (queue.length > 0 && visitedPages.size < maxPages && job.status === 'running') {
    const { url, depth, source } = queue.shift();

    if (visitedPages.has(url) || depth > maxDepth) {
      continue;
    }

    visitedPages.add(url);
    job.pagesProcessed = visitedPages.size;
    job.currentUrl = url;
    job.progress = Math.min(95, (visitedPages.size / maxPages) * 100);

    const linkCheck = await checkLink(url, timeout);
    discoveredLinks.set(url, {
      url,
      status: linkCheck.status,
      statusText: linkCheck.statusText,
      responseTime: linkCheck.responseTime,
      broken: linkCheck.broken,
      source,
      depth,
      type: isSameDomain(url, startUrl) ? 'internal' : 'external',
      timestamp: new Date().toISOString()
    });

    job.totalLinks = discoveredLinks.size;
    job.brokenLinks = Array.from(discoveredLinks.values()).filter(l => l.broken).length;
    job.links = Array.from(discoveredLinks.values());

    if (!linkCheck.broken && depth < maxDepth && isSameDomain(url, startUrl)) {
      const pageLinks = await extractLinksFromPage(url, timeout);
      for (const link of pageLinks) {
        if (!discoveredLinks.has(link) && !visitedPages.has(link)) {
          queue.push({ url: link, depth: depth + 1, source: url });
        }
      }
    }

    await delay(rateLimit);
  }

  job.status = 'completed';
  job.progress = 100;
  job.endTime = Date.now();
  job.duration = job.endTime - job.startTime;

  const jobFile = path.join(CRAWL_DATA_DIR, `${jobId}.json`);
  await fs.writeFile(jobFile, JSON.stringify({
    jobId,
    url: startUrl,
    config,
    results: job.links,
    summary: {
      totalLinks: job.totalLinks,
      brokenLinks: job.brokenLinks,
      pagesProcessed: job.pagesProcessed,
      duration: job.duration
    }
  }, null, 2));

  const brokenLinksFile = path.join(CRAWL_DATA_DIR, `${jobId}_broken.json`);
  const brokenLinks = job.links.filter(l => l.broken);
  await fs.writeFile(brokenLinksFile, JSON.stringify(brokenLinks, null, 2));
}

app.post('/api/crawl', async (req, res) => {
  const { url, maxDepth = 2, maxPages = 100, timeout = 10000, rateLimit = 500 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const jobId = generateJobId();
  const job = {
    jobId,
    url,
    status: 'pending',
    progress: 0,
    totalLinks: 0,
    brokenLinks: 0,
    pagesProcessed: 0,
    currentUrl: '',
    links: [],
    createdAt: Date.now()
  };

  crawlJobs.set(jobId, job);

  crawlWebsite(jobId, url, { maxDepth, maxPages, timeout, rateLimit }).catch(error => {
    job.status = 'failed';
    job.error = error.message;
  });

  res.json({ jobId, status: 'started' });
});

app.get('/api/crawl/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = crawlJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    jobId: job.jobId,
    url: job.url,
    status: job.status,
    progress: job.progress,
    totalLinks: job.totalLinks,
    brokenLinks: job.brokenLinks,
    pagesProcessed: job.pagesProcessed,
    currentUrl: job.currentUrl,
    links: job.links
  });
});

app.get('/api/export/:jobId/json', async (req, res) => {
  const { jobId } = req.params;
  const job = crawlJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${jobId}_results.json"`);
  res.json(job.links);
});

app.get('/api/export/:jobId/csv', async (req, res) => {
  const { jobId } = req.params;
  const job = crawlJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const csvHeader = 'URL,Status,Status Text,Response Time (ms),Broken,Type,Source,Depth\n';
  const csvRows = job.links.map(link => 
    `"${link.url}",${link.status},"${link.statusText}",${link.responseTime},${link.broken},${link.type},"${link.source}",${link.depth}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${jobId}_results.csv"`);
  res.send(csvHeader + csvRows);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LinkSpider backend running on port ${PORT}`);
});