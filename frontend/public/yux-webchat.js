(function () {
  var script = document.currentScript;
  if (!script) return;

  var publicToken = script.getAttribute('data-yux-widget-token');
  var endpoint = script.getAttribute('data-yux-endpoint') || '/api/public/webchat/events';
  var iframeBase = script.getAttribute('data-yux-iframe-base') || '/webchat/session/';

  if (!publicToken) return;

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'bootstrap_widget',
      publicToken: publicToken,
      origin: window.location.origin
    })
  })
    .then(function (response) {
      if (!response.ok) throw new Error('Widget unavailable');
      return response.json();
    })
    .then(function (payload) {
      if (!payload.sessionToken) return;
      var iframe = document.createElement('iframe');
      iframe.src = iframeBase + encodeURIComponent(payload.sessionToken);
      iframe.title = 'YUX Webchat';
      iframe.style.position = 'fixed';
      iframe.style.right = '16px';
      iframe.style.bottom = '16px';
      iframe.style.width = '380px';
      iframe.style.height = '620px';
      iframe.style.maxWidth = 'calc(100vw - 32px)';
      iframe.style.maxHeight = 'calc(100vh - 32px)';
      iframe.style.border = '1px solid #d1d5db';
      iframe.style.borderRadius = '8px';
      iframe.style.boxShadow = '0 20px 50px rgba(15, 23, 42, 0.18)';
      iframe.style.background = '#fff';
      iframe.style.zIndex = '2147483647';
      document.body.appendChild(iframe);
    })
    .catch(function () {
      return undefined;
    });
})();
