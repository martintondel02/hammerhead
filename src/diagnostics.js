(() => {
  if (window.__hammerheadDiagnostics) return;
  const MAX = 3000;
  const buffer = [];
  const push = (level, args) => {
    try {
      const ts = new Date().toISOString().slice(11, 23);
      const text = args.map((a) => {
        if (a instanceof Error) return a.stack || `${a.name}: ${a.message}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return String(a); }
        }
        return String(a);
      }).join(' ');
      buffer.push(`[${ts}] [${level}] ${text}`);
      if (buffer.length > MAX) buffer.shift();
    } catch { /* never break the page */ }
  };

  ['log', 'info', 'warn', 'error', 'debug'].forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      push(level.toUpperCase(), args);
      original(...args);
    };
  });

  window.addEventListener('error', (event) => {
    push('ERROR', [`${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    push('REJECTION', [`Unhandled promise rejection:`, event.reason]);
  });

  const origGUM = navigator.mediaDevices && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  if (origGUM) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      push('GUM', ['getUserMedia called', JSON.stringify(constraints)]);
      try {
        const stream = await origGUM(constraints);
        push('GUM', ['getUserMedia OK', `tracks=${stream.getTracks().length}`]);
        stream.getTracks().forEach((t) => {
          push('GUM-TRACK', [`${t.kind} label="${t.label}" readyState=${t.readyState}`]);
          t.addEventListener('ended', () => push('GUM-TRACK', [`${t.kind} ENDED`]));
        });
        return stream;
      } catch (err) {
        push('GUM', [`getUserMedia FAILED: ${err.name}: ${err.message}`]);
        throw err;
      }
    };
  }

  const OrigPC = window.RTCPeerConnection;
  if (OrigPC) {
    window.RTCPeerConnection = function (...args) {
      const pc = new OrigPC(...args);
      push('PC', ['new RTCPeerConnection', JSON.stringify(args[0] || {})]);
      pc.addEventListener('iceconnectionstatechange', () => {
        push('PC', [`ICE state: ${pc.iceConnectionState}`]);
      });
      pc.addEventListener('connectionstatechange', () => {
        push('PC', [`connection state: ${pc.connectionState}`]);
      });
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigPC.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection, OrigPC);
  }

  window.__hammerheadDiagnostics = () => buffer.join('\n');
  push('BOOT', [`Hammerhead diagnostics ready — UA: ${navigator.userAgent}`]);
})();