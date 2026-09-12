export function generateSpaInterceptorScript(jobId: string, sourceUrl: string, finalUrl: string, isMobile: boolean): string {
  return `
<script>
(function() {
  'use strict';
  var JOB_ID = ${JSON.stringify(jobId)};
  var SOURCE_URL = ${JSON.stringify(sourceUrl)};
  var FINAL_URL = ${JSON.stringify(finalUrl || sourceUrl)};
  var IS_MOBILE = ${JSON.stringify(isMobile)};
  var targetOrigin = '';

  try {
    targetOrigin = new URL(FINAL_URL).origin;
  } catch (e) {}

  var status = {
    isSpa: false,
    splashDetected: false,
    splashDismissed: false,
    networkRequests: 0,
    errorsCount: 0
  };

  function notifyParent(extra) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(Object.assign({ type: 'SPECTRE_SPA_STATUS' }, status, extra || {}), '*');
      }
    } catch (e) {}
  }

  try {
    Object.defineProperty(window, 'top', { get: function() { return window.self; }, configurable: true });
    Object.defineProperty(window, 'parent', { get: function() { return window.self; }, configurable: true });
  } catch (e) {}

  if (typeof navigator !== 'undefined') {
    try {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = function() {
          return Promise.resolve({
            scope: '/',
            unregister: function() { return Promise.resolve(true); },
            active: null,
            installing: null,
            waiting: null
          });
        };
      }
      navigator.sendBeacon = function() { return true; };
    } catch (e) {}
  }

  function rewriteUrl(value) {
    if (!value || typeof value !== 'string') return value;
    if (/^(data|blob|javascript):/i.test(value) || value.charAt(0) === '#') return value;
    if (value.indexOf('/api/clone/' + JOB_ID + '/preview/') === 0) return value;
    if (value.charAt(0) === '/') {
      return '/api/clone/' + JOB_ID + '/proxy?path=' + encodeURIComponent(value);
    }
    if (/^https?:\\/\\//i.test(value)) {
      try {
        var parsed = new URL(value);
        if (parsed.origin === targetOrigin) {
          return '/api/clone/' + JOB_ID + '/proxy?url=' + encodeURIComponent(value);
        }
      } catch (e) {}
    }
    return value;
  }

  if (typeof window.fetch === 'function') {
    var originalFetch = window.fetch;
    window.fetch = function(resource, init) {
      status.networkRequests++;
      var originalUrl = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
      var rewritten = rewriteUrl(originalUrl);
      if (typeof resource === 'string') {
        resource = rewritten;
      } else if (resource && resource.url) {
        try {
          resource = new Request(rewritten, init || resource);
          init = undefined;
        } catch (e) {
          resource = rewritten;
        }
      }
      return originalFetch.call(this, resource, init);
    };
  }

  if (typeof window.XMLHttpRequest === 'function') {
    var originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
      status.networkRequests++;
      this.__spectreOriginalUrl = url;
      return originalOpen.call(this, method, rewriteUrl(url), async !== false, user, password);
    };
  }

  var originalCreateElement = document.createElement;
  document.createElement = function(tagName, options) {
    var element = originalCreateElement.call(document, tagName, options);
    var tag = String(tagName).toLowerCase();
    if (tag === 'script' || tag === 'link') {
      var originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        if (typeof value === 'string' && ((tag === 'script' && name.toLowerCase() === 'src') || (tag === 'link' && name.toLowerCase() === 'href'))) {
          value = rewriteUrl(value);
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };

  window.addEventListener('error', function() {
    status.errorsCount++;
    notifyParent();
  }, true);

  window.addEventListener('unhandledrejection', function() {
    status.errorsCount++;
    notifyParent();
  });

  function findSplashScreen() {
    return document.getElementById('splash-screen') || document.querySelector('[id*="splash"], .splash-screen, [class*="splash"]');
  }

  function dismissSplashScreen() {
    var splash = findSplashScreen();
    if (!splash) return false;
    splash.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    setTimeout(function() {
      if (splash.parentNode) splash.style.display = 'none';
    }, 260);
    status.splashDismissed = true;
    notifyParent({ splashDismissed: true });
    return true;
  }

  function inspect() {
    var splash = findSplashScreen();
    if (splash) {
      status.splashDetected = true;
      status.isSpa = true;
      notifyParent({ splashDetected: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inspect, { once: true });
  } else {
    inspect();
  }

  setTimeout(function() {
    var splash = findSplashScreen();
    if (splash && document.body && document.body.children.length > 1) dismissSplashScreen();
  }, 1500);

  window.addEventListener('message', function(event) {
    if (!event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'SPECTRE_DISMISS_SPLASH' || event.data.type === 'SPECTRE_FORCE_RENDER') {
      dismissSplashScreen();
    }
  });
})();
</script>`;
}
