/* Cat Herding NES player, built on jsnes (Apache-2.0). No build step. */
(function () {
  'use strict';

  var ROM_URL = 'catherding.nes';
  var W = 256, H = 240;
  var FRAME_MS = 1000 / 60.0988; // NTSC
  var Controller = jsnes.Controller;

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  var imageData = ctx.createImageData(W, H);
  var pixels32 = new Uint32Array(imageData.data.buffer);
  var statusEl = document.getElementById('status');
  var startBtn = document.getElementById('start');
  var pausedEl = document.getElementById('paused');
  var stage = document.getElementById('stage');

  // Exposed for the hub smoke test.
  var debug = (window.__catHerding = { frames: 0, state: 'loading', romBytes: 0 });

  /* ---------- audio: ring buffer feeding a ScriptProcessor ---------- */
  var audioCtx = null, scriptNode = null;
  var RING = 16384; // power of two
  var ringL = new Float32Array(RING), ringR = new Float32Array(RING);
  var ringRead = 0, ringWrite = 0;

  function ringAvailable() { return (ringWrite - ringRead + RING) % RING; }

  function onAudioSample(l, r) {
    if (!audioCtx) return;
    var next = (ringWrite + 1) % RING;
    if (next === ringRead) return; // overflow: drop
    ringL[ringWrite] = l; ringR[ringWrite] = r;
    ringWrite = next;
  }

  function initAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx = new AC({ latencyHint: 'interactive' });
      scriptNode = audioCtx.createScriptProcessor(1024, 0, 2);
      scriptNode.onaudioprocess = function (e) {
        var outL = e.outputBuffer.getChannelData(0), outR = e.outputBuffer.getChannelData(1);
        for (var i = 0; i < outL.length; i++) {
          if (ringRead !== ringWrite) {
            outL[i] = ringL[ringRead]; outR[i] = ringR[ringRead];
            ringRead = (ringRead + 1) % RING;
          } else { outL[i] = 0; outR[i] = 0; }
        }
      };
      scriptNode.connect(audioCtx.destination);
    } catch (err) {
      console.warn('Audio unavailable:', err);
      audioCtx = null;
    }
  }

  /* ---------- emulator ---------- */
  var nes = new jsnes.NES({
    onFrame: function (buf) {
      for (var i = 0; i < buf.length; i++) pixels32[i] = 0xff000000 | buf[i]; // jsnes emits canvas-ready ABGR
      ctx.putImageData(imageData, 0, 0);
      debug.frames++;
    },
    onAudioSample: onAudioSample,
    sampleRate: 48000,
  });

  /* ---------- input ---------- */
  var NAMES = {
    A: Controller.BUTTON_A, B: Controller.BUTTON_B, SELECT: Controller.BUTTON_SELECT, START: Controller.BUTTON_START,
    UP: Controller.BUTTON_UP, DOWN: Controller.BUTTON_DOWN, LEFT: Controller.BUTTON_LEFT, RIGHT: Controller.BUTTON_RIGHT,
  };
  var KEYS = {
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    KeyX: 'A', KeyZ: 'B', Enter: 'START', ShiftLeft: 'SELECT', ShiftRight: 'SELECT',
  };
  // Separate sources so one releasing never clears another that is still held.
  var held = { key: {}, pad: {}, touch: {} };
  var applied = {};

  function syncButtons() {
    Object.keys(NAMES).forEach(function (name) {
      var down = !!(held.key[name] || held.pad[name] || held.touch[name]);
      if (down && !applied[name]) nes.buttonDown(1, NAMES[name]);
      else if (!down && applied[name]) nes.buttonUp(1, NAMES[name]);
      applied[name] = down;
    });
  }

  function releaseAll() { held.key = {}; held.pad = {}; held.touch = {}; syncButtons(); }

  window.addEventListener('keydown', function (e) {
    if (e.code === 'Enter' && debug.state === 'ready') { e.preventDefault(); start(); return; }
    var name = KEYS[e.code];
    if (!name) return;
    e.preventDefault();
    held.key[name] = true;
    syncButtons();
  });
  window.addEventListener('keyup', function (e) {
    var name = KEYS[e.code];
    if (!name) return;
    e.preventDefault();
    held.key[name] = false;
    syncButtons();
  });

  function pollGamepad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = {};
    for (var i = 0; i < pads.length; i++) {
      var p = pads[i];
      if (!p || !p.connected) continue;
      var b = function (n) { return p.buttons[n] && p.buttons[n].pressed; };
      var ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (b(12) || ay < -0.5) pad.UP = true;
      if (b(13) || ay > 0.5) pad.DOWN = true;
      if (b(14) || ax < -0.5) pad.LEFT = true;
      if (b(15) || ax > 0.5) pad.RIGHT = true;
      if (b(0) || b(2)) pad.B = true;   // south / west
      if (b(1) || b(3)) pad.A = true;   // east / north
      if (b(8)) pad.SELECT = true;
      if (b(9)) pad.START = true;
    }
    held.pad = pad;
  }

  Array.prototype.forEach.call(document.querySelectorAll('#touch [data-btn]'), function (el) {
    var name = el.getAttribute('data-btn');
    function down(e) { e.preventDefault(); held.touch[name] = true; el.classList.add('down'); syncButtons(); }
    function up(e) { e.preventDefault(); held.touch[name] = false; el.classList.remove('down'); syncButtons(); }
    el.addEventListener('pointerdown', function (e) {
      if (debug.state === 'ready') start();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      down(e);
    });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  /* ---------- integer nearest-neighbour scaling ---------- */
  function rescale() {
    var availW = Math.max(W, stage.parentElement.clientWidth - 8);
    var availH = Math.max(H, window.innerHeight - (document.querySelector('.bar').offsetHeight + 90));
    if (document.getElementById('touch').offsetParent !== null) availH = Math.max(H, availH - 190);
    var scale = Math.max(1, Math.floor(Math.min(availW / W, availH / H)));
    canvas.style.width = W * scale + 'px';
    canvas.style.height = H * scale + 'px';
  }
  window.addEventListener('resize', rescale);
  rescale();

  /* ---------- main loop ---------- */
  var running = false, last = 0, acc = 0, rafId = 0;

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    acc += Math.min(now - last, 100);
    last = now;
    pollGamepad();
    syncButtons();
    var steps = 0;
    while (acc >= FRAME_MS && steps < 4) { nes.frame(); acc -= FRAME_MS; steps++; }
    if (steps === 4) acc = 0;
  }

  function resume() {
    if (running || debug.state === 'loading' || debug.state === 'ready' || debug.state === 'error') return;
    running = true; last = performance.now(); acc = 0;
    pausedEl.hidden = true;
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    debug.state = 'running';
    rafId = requestAnimationFrame(loop);
  }

  function pause(reason) {
    if (!running) return;
    running = false;
    cancelAnimationFrame(rafId);
    releaseAll();
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend();
    debug.state = 'paused';
    pausedEl.textContent = reason === 'hidden' ? 'Paused — click to resume' : 'Paused — click to resume';
    pausedEl.hidden = false;
  }

  document.addEventListener('visibilitychange', function () { if (document.hidden) pause('hidden'); });
  window.addEventListener('blur', function () { /* keep running on blur; only hidden tabs pause */ });
  pausedEl.addEventListener('click', resume);

  function start() {
    if (debug.state !== 'ready') return;
    startBtn.hidden = true;
    initAudio(); // must happen inside a user gesture
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    debug.state = 'paused';
    resume();
    statusEl.textContent = audioCtx ? 'Playing.' : 'Playing (audio unavailable in this browser).';
  }
  startBtn.addEventListener('click', start);

  /* ---------- boot: fetch ROM ---------- */
  fetch(ROM_URL).then(function (res) {
    if (!res.ok) throw new Error('ROM request failed: HTTP ' + res.status);
    return res.arrayBuffer();
  }).then(function (buf) {
    debug.romBytes = buf.byteLength;
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    nes.loadROM(s);
    debug.state = 'ready';
    statusEl.textContent = 'ROM loaded (' + buf.byteLength + ' bytes). Ready.';
    startBtn.focus();
  }).catch(function (err) {
    debug.state = 'error';
    statusEl.textContent = 'Could not start: ' + err.message;
    console.error(err);
  });
})();
