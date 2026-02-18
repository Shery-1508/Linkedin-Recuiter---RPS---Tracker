// Content script – runs on every LinkedIn page (no popup needed).
// Detects session-conflict ("multiple sign-ins") page and notifies background so status updates to logged out.

(function() {
  'use strict';

  var contextInvalidated = false;

  function isContextInvalidatedError(e) {
    var msg = (e && (e.message || e.reason && e.reason.message)) || String(e);
    return msg.indexOf('Extension context invalidated') !== -1;
  }

  self.onerror = function(msg, url, line, col, err) {
    if (err && isContextInvalidatedError(err)) {
      contextInvalidated = true;
      return true;
    }
    if (msg && isContextInvalidatedError(msg)) {
      contextInvalidated = true;
      return true;
    }
    return false;
  };

  self.onunhandledrejection = function(event) {
    if (event.reason && isContextInvalidatedError(event.reason)) {
      contextInvalidated = true;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  function extractAccountInfo() {
    // Note: RPS account detection is now handled by the background script using Firebase config.
    // This content script focuses on extracting the logged-in user's email from the page.

    // Method 1: Check for email in page data/scripts
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.email) {
            return { email: data.email };
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Method 2: Check for email in meta tags
    try {
      const emailMeta = document.querySelector('meta[property="og:email"]');
      if (emailMeta && emailMeta.content) {
        return { email: emailMeta.content };
      }
    } catch (e) {}

    // Method 3: Try to extract from page text/links (look for email patterns)
    try {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const pageText = document.body.innerText || '';
      const matches = pageText.match(emailRegex);
      if (matches && matches.length > 0) {
        // Filter out common non-account emails
        const filtered = matches.filter(email => 
          !email.includes('linkedin.com') && 
          !email.includes('example.com') &&
          !email.includes('test.com')
        );
        if (filtered.length > 0) {
          return { email: filtered[0] };
        }
      }
    } catch (e) {}

    // Method 4: Check for username in URL or profile elements
    try {
      // LinkedIn profile URLs often contain username
      const profileMatch = window.location.pathname.match(/\/in\/([^\/]+)/);
      if (profileMatch) {
        // This is a profile page, but we need the logged-in user's email
        // Check if we can find it in the navigation or user menu
        const userMenu = document.querySelector('[data-control-name="nav.settings"]');
        if (userMenu) {
          const emailAttr = userMenu.getAttribute('data-email') || 
                           userMenu.getAttribute('aria-label');
          if (emailAttr && emailAttr.includes('@')) {
            return { email: emailAttr };
          }
        }
      }
    } catch (e) {}

    // Method 5: Check localStorage/sessionStorage for user data
    try {
      const storageKeys = Object.keys(localStorage);
      for (const key of storageKeys) {
        if (key.toLowerCase().includes('email') || key.toLowerCase().includes('user')) {
          const value = localStorage.getItem(key);
          if (value && value.includes('@') && !value.includes('linkedin.com')) {
            try {
              const parsed = JSON.parse(value);
              if (parsed.email) {
                return { email: parsed.email };
              }
            } catch {
              if (value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)) {
                return { email: value };
              }
            }
          }
        }
      }
    } catch (e) {}

    return null;
  }

  function isSessionConflictPage() {
    try {
      if (!window.location.href || !window.location.href.includes('linkedin.com')) return false;
      if (window.location.pathname.indexOf('enterprise-authentication/sessions') !== -1) return true;
      if (window.location.pathname.indexOf('checkpoint') !== -1) return true;
      const bodyText = (document.body && document.body.innerText) ? document.body.innerText : '';
      if (/multiple sign-ins|only one session is allowed|sign out this session/i.test(bodyText)) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function notifySessionConflictIfNeeded() {
    if (contextInvalidated) return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      if (!isSessionConflictPage()) return;
      chrome.runtime.sendMessage({ action: 'sessionConflictDetected' }).catch(function() {
        contextInvalidated = true;
      });
    } catch (e) {
      contextInvalidated = true;
    }
  }

  function safeSendMessage(msg) {
    if (contextInvalidated) return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      chrome.runtime.sendMessage(msg).catch(function() {
        contextInvalidated = true;
      });
    } catch (e) {
      contextInvalidated = true;
    }
  }

  function setupMessageListener() {
    if (contextInvalidated) return;
    try {
      chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (contextInvalidated) return true;
        try {
          if (request.action === "getAccountInfo") {
            sendResponse(extractAccountInfo());
          } else if (request.action === "checkSessionConflict") {
            sendResponse({ sessionConflict: isSessionConflictPage() });
          }
        } catch (e) {
          sendResponse(null);
        }
        return true;
      });
    } catch (e) {
      contextInvalidated = true;
    }
  }

  if (!contextInvalidated) {
    try {
      setupMessageListener();
      notifySessionConflictIfNeeded();
      setInterval(notifySessionConflictIfNeeded, 3000);
    } catch (e) {
      contextInvalidated = true;
    }
  }

  var lastEmail = null;
  setInterval(function() {
    if (contextInvalidated) return;
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
      var info = extractAccountInfo();
      if (info && info.email && info.email !== lastEmail) {
        lastEmail = info.email;
        safeSendMessage({ action: "accountDetected", email: info.email });
      }
    } catch (e) {
      contextInvalidated = true;
    }
  }, 5000);

})();
