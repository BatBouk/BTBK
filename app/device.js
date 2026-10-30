/* CleanFrame device layer for TizenBrew.
   Inside a TizenBrew module page the Tizen APIs do not exist, so app launches and the
   installed-app list go through the module's local service (127.0.0.1 only).
   If window.tizen is ever present (signed package), the original Tizen calls are used. */
(function () {
  'use strict';
  var BASE = 'http://127.0.0.1:18793';
  var BRANDS = { netflix: 1, youtube: 1, primevideo: 1, disneyplus: 1, appletv: 1, applemusic: 1 };
  var IDS = {
    netflix: 'org.tizen.netflix-app', youtube: '111299001912', primevideo: 'org.tizen.primevideo',
    disneyplus: '3201901017640', appletv: 'com.samsung.tv.aria-video', applemusic: 'org.tizen.apple.apple-music'
  };

  function api() { return window.tizen && window.tizen.application; }

  function bounded(done, timeout) {
    var finished = false, timer = setTimeout(function () { finish({ message: 'The TV did not respond. Please try again.' }); }, timeout || 10000);
    function finish(err, value) { if (finished) return; finished = true; clearTimeout(timer); done(err, value); }
    return finish;
  }

  function failure(err, fallback) {
    return { message: fallback || 'The TV could not open this screen.', detail: err && (err.message || err.name) || 'Try again.' };
  }

  /* Minimal JSON request to the local service (ES5 XHR). */
  function request(method, path, body, timeout, done) {
    var xhr = new XMLHttpRequest(), settled = false;
    function settle(err, data) { if (settled) return; settled = true; done(err, data); }
    try {
      xhr.open(method, BASE + path, true);
      xhr.timeout = timeout;
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        var data = null;
        try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
        if (xhr.status >= 200 && xhr.status < 300 && data) settle(null, data);
        else settle({ message: (data && data.message) || 'The TV refused the request.', detail: (data && data.detail) || ('HTTP ' + xhr.status) });
      };
      xhr.onerror = function () { settle({ message: 'CleanFrame cannot reach its TizenBrew service.', detail: 'Close TizenBrew, restart the TV, then open CleanFrame again.' }); };
      xhr.ontimeout = function () { settle({ message: 'The TV did not respond. Please try again.' }); };
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) { settle({ message: 'CleanFrame cannot reach its TizenBrew service.', detail: e && e.message || '' }); }
  }

  function bridgeLaunch(id, done) {
    var finish = bounded(done, 12000);
    request('POST', '/v1/launch', { appId: id }, 10000, function (err) { finish(err || null); });
  }

  function launchApp(id, done) {
    var finish;
    if (api()) {
      finish = bounded(done);
      try { api().launch(id, function () { finish(null); }, function (err) { finish(failure(err)); }); }
      catch (err) { finish(failure(err)); }
      return;
    }
    bridgeLaunch(id, done);
  }

  function launch(brand, done) {
    if (!IDS[brand]) { done({ message: 'This app has no launch target.' }); return; }
    launchApp(IDS[brand], done);
  }

  function art(done) {
    done({ message: 'Art Mode is only available on The Frame.', detail: 'This TV does not have it.' });
  }

  function home(done) { launchApp('com.samsung.tv.csfs', done); }
  function settings(done) { launchApp('com.samsung.tv.coba.setting', done); }

  function apps(done) {
    var finish = bounded(done, 25000);
    request('GET', '/v1/apps', null, 22000, function (err, data) {
      var list;
      if (err) { finish(err); return; }
      list = (data && data.apps) || [];
      list = list.filter(function (a) { return a && typeof a.appId === 'string' && typeof a.name === 'string'; })
        .map(function (a, i) { return { appId: a.appId, name: a.name, brand: a.brand || '', icon: '', rank: i }; });
      finish(null, list);
    });
  }

  window.FrameDevice = { launch: launch, launchApp: launchApp, art: art, home: home, settings: settings, apps: apps, brands: BRANDS };
}());
