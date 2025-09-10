/**
 * Performance optimization script
 * Optimizes Core Web Vitals by preloading important routes and optimizing image loading
 */

// Optimize for Core Web Vitals
// Preload important routes
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    // Preload critical routes
    const routes = ['/upload', '/analysis'];
    routes.forEach(route => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = route;
      document.head.appendChild(link);
    });
  });
}

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