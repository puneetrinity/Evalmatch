/**
 * Performance optimization script
 * - Advanced chunk prefetch using Vite manifest (production)
 * - Fallback route prefetch (dev/no manifest)
 * - Image lazy loading hydration
 */

(function () {
  const metrics = (window.__prefetchMetrics = window.__prefetchMetrics || {
    enabled: false,
    manifestLoaded: false,
    observedLinks: 0,
    preloadedChunks: 0,
    preloadedRoutes: 0,
    errors: 0,
    // Enhanced observability
    navigationHits: 0,
    cacheHits: 0,
    connectionType: 'unknown',
    adaptiveMargin: '200px',
  });

  // Routes to prioritize for prefetch
  const PRIORITY_ROUTES = [
    /^\/upload(\/|$)/,
    /^\/job-description(\/|$)/,
    /^\/analysis\//,
    /^\/bias-detection\//,
    /^\/my-resumes(\/|$)/,
    /^\/my-analyses(\/|$)/,
    /^\/profile(\/|$)/,
  ];

  // Map internal URL path to source module path used by Vite (keys in manifest)
  function routeToModule(href) {
    // Vite manifest keys are relative to Vite root (client/), so use paths starting with src/
    if (/^\/upload(\/|$)/.test(href)) return 'src/pages/upload.tsx';
    if (/^\/job-description(\/|$)/.test(href)) return 'src/pages/job-description.tsx';
    if (/^\/analysis\//.test(href)) return 'src/pages/analysis.tsx';
    if (/^\/bias-detection\//.test(href)) return 'src/pages/bias-detection.tsx';
    if (/^\/interview\//.test(href)) return 'src/pages/interview.tsx';
    if (/^\/sdk-tokens(\/|$)/.test(href)) return 'src/pages/sdk-tokens.tsx';
    if (/^\/my-resumes(\/|$)/.test(href)) return 'src/pages/my-resumes.tsx';
    if (/^\/my-analyses(\/|$)/.test(href)) return 'src/pages/my-analyses.tsx';
    if (/^\/profile(\/|$)/.test(href)) return 'src/pages/profile.tsx';
    if (/^\/privacy-policy(\/|$)/.test(href)) return 'src/pages/privacy-policy.tsx';
    if (/^\/terms-of-service(\/|$)/.test(href)) return 'src/pages/terms-of-service.tsx';
    if (/^\/feedback(\/|$)/.test(href)) return 'src/pages/feedback.tsx';
    return null;
  }

  const seen = new Set();
  function once(key, fn) {
    if (seen.has(key)) return false;
    seen.add(key);
    try { fn(); } catch (e) { metrics.errors++; }
    return true;
  }

  // Attach a <link rel="modulepreload"> for each chunk file
  function modulePreload(href) {
    once('preload:' + href, () => {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = href;
      link.crossOrigin = '';
      document.head.appendChild(link);
      metrics.preloadedChunks++;
    });
  }

  function shouldPrefetch(href) {
    return PRIORITY_ROUTES.some((re) => re.test(href));
  }

  async function loadManifest() {
    try {
      const res = await fetch('/vite.manifest.json', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('manifest not found');
      const json = await res.json();
      metrics.manifestLoaded = true;
      return json;
    } catch (_) {
      return null;
    }
  }

  // Determine connection type and adapt sensitivity
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const adaptiveMargin = connection && connection.effectiveType === '4g' ? '200px' : '50px';
  metrics.connectionType = connection && connection.effectiveType ? connection.effectiveType : 'unknown';
  metrics.adaptiveMargin = adaptiveMargin;

  function observeLinks(handler, rootMargin) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const a = entry.target;
        const href = a.getAttribute('href');
        io.unobserve(a);
        metrics.observedLinks++;
        handler(href);
      });
    }, { rootMargin });

    document.querySelectorAll('a[href^="/"]').forEach((a) => {
      // Only internal links
      const href = a.getAttribute('href');
      if (!href || href.startsWith('//')) return;
      if (!shouldPrefetch(href)) return;
      io.observe(a);
    });
  }

  function fallbackRoutePrefetch(rootMargin) {
    observeLinks((href) => {
      once('route:' + href, () => {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = href;
        document.head.appendChild(link);
        metrics.preloadedRoutes++;
      });
    }, rootMargin);
  }

  function setupWithManifest(manifest) {
    const bySrc = manifest || {};
    observeLinks((href) => {
      const src = routeToModule(href);
      if (!src || !bySrc[src]) return;
      const entry = bySrc[src];
      const base = '/';

      // Preload the chunk for this route
      if (entry.file) modulePreload(base + entry.file);
      // Preload its dynamic imports
      if (Array.isArray(entry.imports)) {
        entry.imports.forEach((imp) => {
          const impEntry = bySrc[imp] || bySrc[imp + ''];
          if (impEntry && impEntry.file) modulePreload(base + impEntry.file);
        });
      }
    }, adaptiveMargin);
  }

  if ('requestIdleCallback' in window && 'IntersectionObserver' in window) {
    requestIdleCallback(async () => {
      metrics.enabled = true;
      const manifest = await loadManifest();
      if (manifest) {
        setupWithManifest(manifest);
        // Development visibility: one-time console info for diagnostics
        try {
          const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
          if (isLocalDev) {
            const routeCount = Object.keys(manifest).filter((k) => k.indexOf('src/pages/') === 0).length;
            // eslint-disable-next-line no-console
            console.info('\uD83D\uDE80 Manifest prefetch active', {
              routes: routeCount,
              connection: metrics.connectionType,
              margin: metrics.adaptiveMargin,
            });
          }
        } catch (_) { /* no-op */ }
      } else {
        // Dev/fallback path
        fallbackRoutePrefetch(adaptiveMargin);
        // Development visibility: one-time console info for diagnostics
        try {
          const isLocalDev = /^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
          if (isLocalDev) {
            // eslint-disable-next-line no-console
            console.info('\uD83D\uDE80 Fallback prefetch active', {
              mode: 'route-prefetch',
              connection: metrics.connectionType,
              margin: metrics.adaptiveMargin,
            });
          }
        } catch (_) { /* no-op */ }
      }
    });
  }

  // Image hydration: native lazy loading enhancement
  if ('loading' in HTMLImageElement.prototype) {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('img[data-src]').forEach((img) => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
      });
    });
  }

  // Navigation hit rate tracking
  try {
    window.addEventListener('popstate', () => { metrics.navigationHits++; });
    once('patchHistory', () => {
      const origPush = history.pushState;
      const origReplace = history.replaceState;
      history.pushState = function pushStatePatched() {
        metrics.navigationHits++;
        return origPush.apply(this, arguments);
      };
      history.replaceState = function replaceStatePatched() {
        metrics.navigationHits++;
        return origReplace.apply(this, arguments);
      };
    });
  } catch (_) { /* no-op */ }

  // Cache hit monitoring for resources (scripts, modulepreload)
  try {
    if ('PerformanceObserver' in window) {
      const po = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          try {
            // Count JS resources loaded from cache
            const isJS = typeof entry.name === 'string' && entry.name.indexOf('.js') !== -1;
            if (isJS && entry.transferSize === 0) {
              metrics.cacheHits++;
            }
          } catch (_) { /* ignore */ }
        });
      });
      po.observe({ entryTypes: ['resource'] });
    }
  } catch (_) { /* ignore */ }
})();

// Optimize image loading
if ('loading' in HTMLImageElement.prototype) {
  // Native lazy loading support
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      img.removeAttribute('data-src');
    });
  });
}
