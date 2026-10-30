/* CleanFrame service for TizenBrew.
   Runs inside TizenBrew's Node service (old Node: ES5 only, built-in modules only).
   Listens on 127.0.0.1 only and relays two things to the TV's own local app API
   (127.0.0.1:8001): "which of these apps are installed" and "launch this app".
   No network access beyond the TV itself, no files written, no credentials. */
(function () {
  'use strict';
  var http = require('http');

  var HOST = '127.0.0.1';
  var PORT = 18793;
  var tvTarget = String(process.env.CLEANFRAME_TV_API || '127.0.0.1:8001').split(':');
  var TV_HOST = tvTarget[0];
  var TV_PORT = Number(tvTarget[1]) || 8001;

  var ORIGINS = { 'http://127.0.0.1:8081': 1, 'http://localhost:8081': 1 };
  if (process.env.CLEANFRAME_TEST_ORIGIN) ORIGINS[process.env.CLEANFRAME_TEST_ORIGIN] = 1;
  var HOSTS = {}; HOSTS[HOST + ':' + PORT] = 1; HOSTS['localhost:' + PORT] = 1;

  /* Each app can have several known IDs (Samsung has used different ones over the years).
     The first ID the TV recognises wins. */
  var GROUPS = [
    { brand: 'netflix', name: 'Netflix', ids: ['org.tizen.netflix-app', '11101200001'] },
    { brand: 'youtube', name: 'YouTube', ids: ['111299001912', '9Ur5IzDKqV.TizenYouTube'] },
    { brand: 'primevideo', name: 'Prime Video', ids: ['org.tizen.primevideo', '3201910019365', '3201512006785'] },
    { brand: 'disneyplus', name: 'Disney+', ids: ['3201901017640', 'MCmYXNxgcu.DisneyPlus'] },
    { brand: 'appletv', name: 'Apple TV', ids: ['com.samsung.tv.aria-video', '3201807016597'] },
    { brand: 'applemusic', name: 'Apple Music', ids: ['org.tizen.apple.apple-music', '3201908019041'] },
    { brand: 'spotify', name: 'Spotify', ids: ['3201606009684', 'rJeHak5zRg.Spotify'] },
    { brand: 'tubi', name: 'Tubi', ids: ['3KA0pm7a7V.TubiTV'] }
  ];
  var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

  function tvRequest(method, id, timeout, done) {
    var finished = false, req;
    function finish(err, res) { if (finished) return; finished = true; done(err, res); }
    try {
      req = http.request({
        host: TV_HOST, port: TV_PORT, method: method,
        path: '/api/v2/applications/' + encodeURIComponent(id),
        headers: { 'Content-Length': 0 }
      }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () { finish(null, { status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }); });
        res.on('error', function (e) { finish(e); });
      });
      req.setTimeout(timeout, function () { try { req.abort(); } catch (e) { } finish(new Error('timeout')); });
      req.on('error', function (e) { finish(e); });
      req.end();
    } catch (e) { finish(e); }
  }

  function probe(id, done) {
    tvRequest('GET', id, 4000, function (err, res) {
      var data = null;
      if (err || !res || res.status !== 200) { done(null); return; }
      try { data = JSON.parse(res.body); } catch (e) { data = null; }
      done(data && typeof data === 'object' && data.id ? data : null);
    });
  }

  function findInstalled(group, done) {
    var i = 0;
    (function step() {
      if (i >= group.ids.length) { done(null); return; }
      var id = group.ids[i++];
      probe(id, function (data) {
        if (data) done({ appId: id, name: group.name, brand: group.brand }); else step();
      });
    }());
  }

  function listApps(done) {
    var out = [], pending = GROUPS.length;
    GROUPS.forEach(function (group, idx) {
      findInstalled(group, function (found) {
        if (found) out[idx] = found;
        if (--pending === 0) done(out.filter(Boolean));
      });
    });
  }

  function candidatesFor(id) {
    var i, j, ids;
    for (i = 0; i < GROUPS.length; i++) {
      ids = GROUPS[i].ids;
      for (j = 0; j < ids.length; j++) {
        if (ids[j] === id) return [id].concat(ids.filter(function (x) { return x !== id; }));
      }
    }
    return [id];
  }

  function launch(id, done) {
    var list = candidatesFor(id), i = 0, last = 'no answer';
    (function step() {
      if (i >= list.length) { done({ message: 'The TV could not open this app.', detail: 'Not found or refused (' + last + '). Tried: ' + list.join(', ') }); return; }
      var current = list[i++];
      tvRequest('POST', current, 8000, function (err, res) {
        if (!err && res && res.status >= 200 && res.status < 300) { done(null, { ok: true, appId: current }); return; }
        last = err ? String(err.message || err) : 'HTTP ' + res.status;
        step();
      });
    }());
  }

  function send(res, status, data, origin) {
    var body = JSON.stringify(data);
    var headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) };
    if (origin) { headers['Access-Control-Allow-Origin'] = origin; headers['Vary'] = 'Origin'; }
    res.writeHead(status, headers);
    res.end(body);
  }

  function handler(req, res) {
    var origin = req.headers.origin, allowedOrigin = origin && ORIGINS[origin] ? origin : '';
    var url = String(req.url || '').split('?')[0], size = 0, chunks = [];
    if (!HOSTS[String(req.headers.host || '')]) { send(res, 400, { message: 'Bad host.' }); return; }
    if (origin && !allowedOrigin) { send(res, 403, { message: 'Origin not allowed.' }); return; }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': allowedOrigin || 'null', 'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'
      });
      res.end();
      return;
    }
    if (req.method === 'GET' && url === '/v1/ping') { send(res, 200, { ok: true, module: 'cleanframe-tizenbrew' }, allowedOrigin); return; }
    if (req.method === 'GET' && url === '/v1/apps') {
      listApps(function (apps) { send(res, 200, { apps: apps }, allowedOrigin); });
      return;
    }
    if (req.method === 'POST' && url === '/v1/launch') {
      if (!allowedOrigin) { send(res, 403, { message: 'Origin not allowed.' }); return; }
      req.on('data', function (c) {
        size += c.length;
        if (size > 1024) { send(res, 413, { message: 'Request too large.' }, allowedOrigin); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', function () {
        var data = null;
        if (res.finished) return;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { data = null; }
        if (!data || typeof data.appId !== 'string' || !ID_PATTERN.test(data.appId)) { send(res, 400, { message: 'Invalid app.' }, allowedOrigin); return; }
        launch(data.appId, function (err, ok) {
          if (err) send(res, 502, err, allowedOrigin); else send(res, 200, ok, allowedOrigin);
        });
      });
      return;
    }
    send(res, 404, { message: 'Not found.' }, allowedOrigin);
  }

  var server = null, started = false;
  function start() {
    if (started) return;
    started = true;
    try {
      server = http.createServer(handler);
      server.on('error', function () { started = false; server = null; });
      server.listen(PORT, HOST);
    } catch (e) { started = false; server = null; }
  }
  function stop() { try { if (server) server.close(); } catch (e) { } server = null; started = false; }

  start();
  if (typeof module !== 'undefined' && module && module.exports) { module.exports = { onStart: start, onStop: stop }; }
}());
