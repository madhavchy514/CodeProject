class VideoPlayer extends HTMLElement {
  #dom = {};
  #abort = new AbortController();
  #video = document.createElement('video');
  #loaded = () => this.#video.readyState >= 1;

  get video() { return this.#video; }
  get src() { return this.#video.src; }
  set src(src) { this.#video.src = src; }
  get fps() { return this.#time.fps; }
  set fps(f) { this.#time.fps = isFinite(f) && f > 0 ? f : this.#time.fps; }
  set keyboard(k) { this.#keyboard.active = k; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = this.#skeleton.html();
  }

  connectedCallback() {
    this.shadowRoot.querySelectorAll('div').forEach((el) => this.#dom[el.id] = el);
    this.#dom.wrapper.prepend(this.#video);
    this.#range.syncAll();
    this.tabIndex = 0;

    this.#abort.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    this.addEventListener('keydown', (e) => this.#keyboard.down(e), { signal });
    document.addEventListener('fullscreenchange', (e) => this.#expandCollapse.ui(), { signal });

    this.#video.addEventListener('loadstart', (e) => this.#init.reset(), { signal });
    this.#video.addEventListener('error', (e) => this.#init.error(), { signal });
    this.#video.addEventListener('loadedmetadata', (e) => this.#init.load(), { signal });
    this.#video.addEventListener('waiting', (e) => this.#state.spinner.show(), { signal });
    this.#video.addEventListener('playing', (e) => this.#state.spinner.hide(), { signal });
    this.#video.addEventListener('canplay', (e) => this.#state.spinner.hide(), { signal });
    this.#video.addEventListener('seeked', (e) => this.#state.spinner.hide(), { signal });
    this.#video.addEventListener('stalled', (e) => this.#state.spinner.hide(), { signal });
    this.#video.addEventListener('timeupdate', (e) => this.#time.mainseek.ui(), { signal });
    this.#video.addEventListener('volumechange', (e) => this.#vol.volseek.ui(), { signal });
    this.#video.addEventListener('volumechange', (e) => this.#vol.remember(), { signal });
    this.#video.addEventListener('volumechange', (e) => this.#muteUnmute.ui(), { signal });
    this.#video.addEventListener('click', (e) => this.#playPause.toggle(), { signal });
    this.#video.addEventListener('play', (e) => this.#playPause.ui(), { signal });
    this.#video.addEventListener('pause', (e) => this.#playPause.ui(), { signal });
    this.#video.addEventListener('dblclick', (e) => this.#expandCollapse.toggle(), { signal });
    this.#video.addEventListener('ratechange', (e) => this.#rate.remember(), { signal });

    this.#dom.wrapper.addEventListener('click', (e) => this.#range.hide(e), { signal });
    this.#dom.wrapper.addEventListener('mouseenter', (e) => this.#state.control.show(), { signal });
    this.#dom.wrapper.addEventListener('mousedown', (e) => this.focus(), { signal });
    this.#dom.wrapper.addEventListener('mousemove', (e) => this.#state.control.show(), { signal });
    this.#dom.wrapper.addEventListener('mousemove', (e) => this.#filter.zmove(e), { signal });
    this.#dom.wrapper.addEventListener('mouseleave', (e) => this.#state.control.hide(), { signal });
    this.#dom.wrapper.addEventListener('touchstart', (e) => this.#state.control.show(), { signal, passive: true });

    this.#dom.playPause.addEventListener('click', (e) => this.#playPause.toggle(false), { signal });
    this.#dom.expandCollapse.addEventListener('click', (e) => this.#expandCollapse.toggle(false), { signal });
    this.#dom.muteUnmute.addEventListener('click', (e) => this.#muteUnmute.toggle(false), { signal });
    this.#dom.mainseek.addEventListener('pointerdown', (e) => this.#time.mainseek.seek(e), { signal });
    this.#dom.volseek.addEventListener('pointerdown', (e) => this.#vol.volseek.seek(e), { signal });
    this.#dom.setting.addEventListener('click', (e) => this.#range.toggle(e), { signal });

    this.#dom.range.addEventListener('click', (e) => e.stopPropagation(), { signal });
    this.#dom.range.addEventListener('dblclick', (e) => e.stopPropagation(), { signal });
    this.#dom.range.addEventListener('input', (e) => this.#range.input(e), { signal });
  }

  disconnectedCallback() {
    clearTimeout(this.#state.timer.status);
    clearTimeout(this.#state.timer.overlay);
    clearTimeout(this.#state.timer.control);
    cancelAnimationFrame(this.#time.mainseek.raf);
    cancelAnimationFrame(this.#abloop.raf);
    this.#abort.abort();
  }

  #init = {
    reset: () => {
      this.#state.control.show(true);
      this.#state.spinner.show();
      this.#state.status.hide();
      this.#dom.currentTime.textContent = ' -- ';
      this.#dom.durationTime.textContent = ' -- ';
      this.#dom.mainseekProgressBar.style.width = 0;
      this.#dom.mainseekBufferBar.style.width = 0;
      this.#dom.mainseekLoopBar.style.width = 0;
      this.#dom.mainseekLoopBar.style.width = '0';
      this.#vol.volseek.ui();
      this.#muteUnmute.ui();
      this.#playPause.ui();
      this.#abloop.reset();
      this.#range.syncAll();
    },

    error: () => {
      this.#state.spinner.hide();
      this.#state.status.show('failed to load video', true);
    },

    load: () => {
      this.#abloop.end = this.#video.duration;
      this.#dom.currentTime.textContent = this.#time.formatTime(this.#video.currentTime);
      this.#dom.durationTime.textContent = this.#time.formatTime(this.#video.duration);
      this.#state.control.show();
      this.#vol.volseek.ui();
      this.#time.mainseek.ui();
      this.#playPause.ui();
      this.#video.playbackRate = this.#rate.value;
      this.#range.syncAll();
    },
  };

  #rate = {
    max: 16, min: 0.07, value: 1, default: 1, step: 0.01,

    reset: (silent = false) => this.#rate.set(this.#rate.default, silent),
    set: (value, silent = false) => {
      if (!isFinite(value)) return;
      const real = this.#math.clamp(value, this.#rate.min, this.#rate.max);
      this.#video.playbackRate = real; 
      if (!silent) this.#state.status.show(`speed: ${real.toFixed(2)}`);
    },

    delta: (delta, silent = false) => {
      if (!isFinite(delta)) return;
      this.#rate.set(this.#video.playbackRate + delta, silent);
    },

    remember: () => {
      if (!this.#loaded()) return;
      this.#range.sync('speed');
      this.#rate.value = this.#math.clamp(this.#video.playbackRate, this.#rate.min ,this.#rate.max);
    },
  };

  #time = {
    fps: 30, min: 0,

    reset: (silent = false, m = 'time') => this.#time.set(this.#time.min, silent, m),
    set: (time, silent = false, m = 'time') => {
      if (!this.#loaded() || !isFinite(time)) return;
      this.#video.currentTime = this.#math.clamp(time, this.#time.min, this.#video.duration);
      if (!silent) {
        const dur = this.#time.formatTime(this.#video.duration)
        const cur = this.#time.formatTime(this.#video.currentTime);
        const total = Math.floor(this.#video.duration * this.#time.fps);
        const frame = Math.floor(this.#video.currentTime * this.#time.fps);
        this.#state.status.show(`${m}: ${m === 'time' ? `${cur} | ${dur}` : `${frame} | ${total}`}`);
      }
    },

    delta: (delta, silent = false) => {
      if (!this.#loaded() || !isFinite(delta)) return;
      this.#time.set(this.#video.currentTime + delta, silent, 'time');
    },

    frame: (direction, silent = false) => {
      if (!this.#loaded()) return;
      const delta = (direction === 'left' ? -1 : 1) / this.#time.fps;
      this.#time.set(this.#video.currentTime + delta, silent, 'frame');
    },

    formatTime: (time) => {
      if (!isFinite(time) || time < 0) return ' -- ';
      const h = Math.floor(time / 3600);
      const m = Math.floor((time % 3600) / 60);
      const s = Math.floor(time % 60);
      const parts = h > 0 ? [h, m.toString().padStart(2, '0')] : [m];
      parts.push(s.toString().padStart(2, '0'));
      return parts.join(':');
    },

    mainseek: {
      seeking: false, raf: 0,

      seek: (e) => {
        if (!this.#loaded()) return;
        this.#time.mainseek.seeking = true;
        this.#dom.mainseek.setPointerCapture(e.pointerId);
        let currentP = this.#math.getP(e, this.#dom.mainseek);
        const scrub = (ev) => {
          currentP = this.#math.getP(ev, this.#dom.mainseek);
          this.#dom.mainseekProgressBar.style.width = `${currentP * 100}%`;
          this.#dom.currentTime.textContent = this.#time.formatTime(currentP * this.#video.duration);
        };
        const stop = () => {
          this.#time.mainseek.seeking = false;
          this.#video.currentTime = currentP * this.#video.duration;
          window.removeEventListener('pointermove', scrub);
          window.removeEventListener('pointerup', stop);
          this.#dom.mainseek.releasePointerCapture(e.pointerId);
        };
        scrub(e);
        window.addEventListener('pointermove', scrub, { signal: this.#abort.signal });
        window.addEventListener('pointerup', stop, { signal: this.#abort.signal });
      },

      ui: () => {
        if (!this.#loaded() || this.#time.mainseek.seeking) return;
        cancelAnimationFrame(this.#time.mainseek.raf);
        const p = (this.#video.currentTime / this.#video.duration) * 100;
        this.#dom.mainseekProgressBar.style.width = `${p || 0}%`;
        this.#dom.currentTime.textContent = this.#time.formatTime(this.#video.currentTime);
        if (this.#video.buffered.length > 0) {
          const end = this.#video.buffered.end(this.#video.buffered.length - 1);
          this.#dom.mainseekBufferBar.style.width = `${(end / this.#video.duration) * 100}%`;
        }
        if (!this.#video.paused) {
          this.#time.mainseek.raf = requestAnimationFrame(this.#time.mainseek.ui);
        }
      },
    },
  };

  #vol = {
    max: 1, min: 0, prev: 1,

    reset: (silent = false) => this.#vol.set(this.#vol.max, silent),
    set: (value, silent = false) => {
      if (!isFinite(value)) return;
      const real = this.#math.clamp(value, this.#vol.min, this.#vol.max);
      this.#video.volume = real;
      if (real !== 0) this.#video.muted = false;
      if (!silent) this.#state.status.show(`volume: ${(real * 100).toFixed(0)}%`);
    },

    delta: (delta, silent = false) => {
      if (!isFinite(delta)) return;
      this.#vol.set(this.#video.volume + delta, silent);
    },

    remember: () => {
      const volume = this.#video.volume;
      if (volume > 0) {
        const value = this.#video.volume;
        this.#vol.prev = this.#math.clamp(value, this.#vol.min, this.#vol.max);
      }
    },

    toggle: () => {
      if ((this.#video.muted ? 0 : this.#video.volume) !== 0) {
        this.#video.muted = true;
      } else {
        this.#video.volume = this.#vol.prev;
        this.#video.muted = false;
      }
    },

    volseek: {
      seek: (e) => {
        this.#dom.volseek.setPointerCapture(e.pointerId);
        const dragVol = (ev) => {
          const p = this.#math.getP(ev, this.#dom.volseek);
          this.#video.volume = p;
          if (p > 0) this.#video.muted = false;
          this.#vol.volseek.ui();
        };
        const stopVol = () => {
          window.removeEventListener('pointermove', dragVol);
          window.removeEventListener('pointerup', stopVol);
          this.#dom.volseek.releasePointerCapture(e.pointerId);
        };
        dragVol(e);
        window.addEventListener('pointermove', dragVol, { signal: this.#abort.signal });
        window.addEventListener('pointerup', stopVol, { signal: this.#abort.signal });
      },

      ui: () => {
        const realVol = this.#video.muted ? 0 : this.#video.volume;
        this.#dom.volseekProgressBar.style.width = `${realVol * 100}%`;
      }
    }
  };

  #filter = {
    contrast: { max: 5, min: 0, value: 1, default: 1, step: 0.1 },
    brightness: { max: 5, min: 0, value: 1, default: 1, step: 0.1 },
    hue: { max: 360, min: 0, value: 0, default: 0, step: 1 },
    saturation: { max: 5, min: 0, value: 1, default: 1, step: 0.1 },
    blur: { max: 10, min: 0, value: 0, default: 0, step: 0.1 },
    grayscale: { max: 1, min: 0, value: 0, default: 0, step: 0.01 },
    invert: { max: 1, min: 0, value: 0, default: 0, step: 0.01 },
    sepia: { max: 1, min: 0, value: 0, default: 0, step: 0.01 },
    zoom: { max: 10, min: 1, value: 1, default: 1, step: 0.1 },

    zmove: (e) => {
      if (this.#filter.zoom.value === 1) return;
      const rect = this.#dom.wrapper.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      this.#video.style.transformOrigin = `${x}% ${y}%`;
    },

    apply: () => {
      this.#video.style.transform = `scale(${this.#filter.zoom.value})`;
      this.#video.style.filter = `
        contrast(${this.#filter.contrast.value}) 
        brightness(${this.#filter.brightness.value})
        grayscale(${this.#filter.grayscale.value})
        hue-rotate(${this.#filter.hue.value}deg)
        saturate(${this.#filter.saturation.value})
        invert(${this.#filter.invert.value})
        sepia(${this.#filter.sepia.value})
        blur(${this.#filter.blur.value}px)
      `;
    },

    set: (field, value, silent = false) => {
      if (!isFinite(value)) return;
      const f = this.#filter[field];
      if (typeof f !== 'object') return;
      f.value = this.#math.clamp(value, f.min, f.max);
      this.#filter.apply();
      this.#range.sync(field);
      if (!silent) this.#state.status.show(`filter: ${field}: ${f.value.toFixed(2)}`);
    },

    delta: (field, delta, silent = false) => {
      if (!isFinite(delta)) return;
      const f = this.#filter[field];
      if (typeof f !== 'object') return;
      this.#filter.set(field, f.value + delta, silent);
    },

    reset: (silent = false) => {
      Object.keys(this.#filter).forEach(key => {
        const f = this.#filter[key];
        if (typeof f !== 'object') return;
        this.#filter.set(key, f.default, true);
      });
      if (!silent) this.#state.status.show(`filter: reset`);
    },
  };

  #state = {
    timer: { status: 0, control: 0, overlay: 0 },
    hide: { status: 800, control: 3000, overlay: 400 },

    spinner: {
      hide: () => this.#dom.spinner.classList.remove('show'),
      show: () => this.#dom.spinner.classList.add('show'),
    },

    status: {
      hide: () => this.#dom.status.classList.remove('show'),
      show: (text, keep = false) => {
        clearTimeout(this.#state.timer.status);
        this.#dom.status.textContent = text;
        this.#dom.status.classList.add('show');
        if (!keep) this.#state.timer.status = setTimeout(this.#state.status.hide, this.#state.hide.status);
      },
    },

    overlay: {
      hide: () => this.#dom.overlay.classList.remove('show'),
      show: (icon, keep = false) => {
        clearTimeout(this.#state.timer.overlay);
        this.#dom.overlay.innerHTML = icon;
        this.#dom.overlay.classList.add('show');
        if (!keep) this.#state.timer.overlay = setTimeout(this.#state.overlay.hide, this.#state.hide.overlay);
      },
    },

    control: {
      hide: () => {
        if (this.#dom.control.matches(':hover')) return;
        this.#dom.range.classList.remove('show');
        this.#dom.wrapper.classList.add('hide-control');
      },

      show: (keep = false) => {
        clearTimeout(this.#state.timer.control);
        this.#dom.wrapper.classList.remove('hide-control');
        if (!keep) this.#state.timer.control = setTimeout(this.#state.control.hide, this.#state.hide.control);
      },
    },
  };

  #range = {
    toggle: (e) => {
      e.stopPropagation();
      this.#dom.range.classList.toggle('show');
    },

    hide: (e) => {
      if (this.#dom.range.contains(e.target) || e.target === this.#dom.setting) return;
      this.#dom.range.classList.remove('show');
    },

    input: (e) => {
      const target = e.target;
      const container = target.parentElement;
      const id = container.id;
      const value = parseFloat(target.value);
      if (id === 'speed') {
        this.#rate.set(value, true);
      } else if (this.#filter[id]) {
        this.#filter.set(id, value, true);
      }
    },

    sync: (id) => {
      const container = this.#dom.range.querySelector(`#${id}`);
      if (!container) return;
      const input = container.querySelector('input');
      const b = container.querySelector('b');
      const val = (id === 'speed') ? this.#video.playbackRate : this.#filter[id]?.value;
      if (val === undefined) return;
      b.textContent = val.toFixed(2);
      input.value = val;
      const min = parseFloat(input.min || 0);
      const max = parseFloat(input.max || 100);
      const pc = ((val - min) / (max - min)) * 100;
      input.style.background = `linear-gradient(to right, #fff ${pc}%, rgba(255, 255, 255, 0.2) ${pc}%)`;
      input.style.backgroundClip = 'content-box';
    },

    syncAll: () => {
      this.#range.sync('speed');
      Object.keys(this.#filter).forEach(key => {
        const f = this.#filter[key];
        if (typeof f !== 'object') return;
        this.#range.sync(key);
      });
    },
  };

  #math = {
    clamp: (v, min, max) => Math.min(max, Math.max(min, v)),
    getP: (e, el) => {
      const r = el.getBoundingClientRect();
      return this.#math.clamp((e.clientX - r.left) / r.width, 0, 1);
    },
  };

  #abloop = {
    looping: false, start: 0, end: NaN, raf: 0, threshold: 1,

    reset: () => {
      this.#abloop.looping = false;
      this.#abloop.start = 0;
      this.#abloop.end = NaN;
      cancelAnimationFrame(this.#abloop.raf);
    },

    check: () => {
      if (!this.#loaded() || !this.#abloop.looping || !isFinite(this.#abloop.end)) return;
      const more = this.#video.currentTime >= this.#abloop.end;
      const less = this.#video.currentTime < this.#abloop.start;
      if (more || less) this.#video.currentTime = this.#abloop.start;
      this.#abloop.raf = requestAnimationFrame(this.#abloop.check);
    },

    setLoop: (silent = false) => {
      if (!this.#loaded() || !isFinite(this.#abloop.end)) return;
      cancelAnimationFrame(this.#abloop.raf);
      this.#abloop.start = this.#video.currentTime; 
      this.#abloop.ui();
      if (silent === false) {
        this.#state.status.show('loop In: ' + this.#time.formatTime(this.#abloop.start));
      }
    },

    startLoop: (set = true, silent = false) => {
      if (!this.#loaded() || !isFinite(this.#abloop.end)) return;
      cancelAnimationFrame(this.#abloop.raf);
      if (this.#video.currentTime <= this.#abloop.start + this.#abloop.threshold) {
        if (!silent) this.#state.status.show('loop: end point must be after start');
        return;
      }
      if (set) this.#abloop.end = this.#video.currentTime;
      this.#abloop.looping = true;
      this.#abloop.check();
      this.#abloop.ui(); 
      if (!silent){
        const start = this.#time.formatTime(this.#abloop.start);
        const end = this.#time.formatTime(this.#abloop.end);
        this.#state.status.show(`loop: ${start} to ${end}`);
      }
    },

    stopLoop: (silent = false) => {
      if (!this.#loaded() || !isFinite(this.#abloop.end)) return;
      cancelAnimationFrame(this.#abloop.raf);
      this.#abloop.looping = false;
      this.#dom.mainseekLoopBar.style.width = '0';
      this.#abloop.start = 0;
      this.#abloop.end = this.#video.duration;
      if (!silent) this.#state.status.show('loop: reset');
    },

    ui: () => {
      if (!this.#loaded() || !this.#abloop.looping || !isFinite(this.#abloop.end)) return;
      const duration = this.#video.duration;
      const startP = (this.#abloop.start / duration) * 100;
      const endP = (this.#abloop.end / duration) * 100;
      this.#dom.mainseekLoopBar.style.left = `${startP}%`;
      this.#dom.mainseekLoopBar.style.width = `${endP - startP}%`;
    },
  };

  #playPause = {
    toggle: async (overlay = true) => {
      if (!this.#loaded()) return;
      this.#video.paused ? await this.#video.play().catch(() => {}) : this.#video.pause();
      if (overlay) {
        const type = this.#video.paused ? 'play' : 'pause';
        this.#state.overlay.show(this.#skeleton.icon[type]);
      }
    },

    ui: () => {
      this.#state.control.show();
      this.#time.mainseek.ui();
      const type = this.#video.paused ? 'play' : 'pause';
      this.#dom.playPause.innerHTML = this.#skeleton.icon[type];
    },
  };

  #expandCollapse = {
    toggle: (overlay = true) => {
      const entering = !document.fullscreenElement;
      entering ? this.requestFullscreen() : document.exitFullscreen();
      if (overlay) {
        const type = entering ? 'expand' : 'collapse';
        this.#state.overlay.show(this.#skeleton.icon[type]);
      }
    },

    ui: () => {
      const type = document.fullscreenElement ? 'collapse' : 'expand';
      this.#dom.expandCollapse.innerHTML = this.#skeleton.icon[type];
    },
  };

  #muteUnmute = {
    toggle: (overlay = true) => {
      this.#vol.toggle();
      const realVol = this.#video.muted ? 0 : this.#video.volume;
      if (overlay) {
        const icon = this.#skeleton.icon[realVol === 0 ? 'mute' : 'unmute'];
        this.#state.overlay.show(icon);
      }
    },

    ui: () => {
      const realVol = this.#video.muted ? 0 : this.#video.volume;
      const icon = this.#skeleton.icon[realVol === 0 ? 'mute' : 'unmute'];
      this.#dom.muteUnmute.innerHTML = icon;
    },
  };

  #keyboard = {
    active: true,
    
    down: (e) => {
      if (!this.#keyboard.active) return;
      const key = e.key.toLowerCase();
      const prevent = [' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
      if (prevent.includes(key)) e.preventDefault();
      const fn = this.#keyboard.map[key];
      if (fn) fn(e);
    },

    map: {
      ' ': (e) => this.#playPause.toggle(true),
      'k': (e) => this.#playPause.toggle(true),
      '[': (e) => this.#rate.delta(-0.05),
      ']': (e) => this.#rate.delta(+0.05),
      '=': (e) => this.#rate.reset(),
      ',': (e) => this.#time.frame('left'),
      '.': (e) => this.#time.frame('right',),
      'arrowleft': (e) => this.#time.delta(-5),
      'arrowright': (e) => this.#time.delta(+5),
      'arrowup': (e) => this.#vol.delta(0.05),
      'arrowdown': (e) => this.#vol.delta(-0.05),
      'f': (e) => this.#expandCollapse.toggle(),
      'm': (e) => this.#muteUnmute.toggle(),
      'a': (e) => this.#abloop.setLoop(),
      's': (e) => this.#abloop.startLoop(),
      'd': (e) => this.#abloop.stopLoop(),
      'x': (e) => this.#filter.delta('sepia', e.shiftKey ? -0.1 : +0.1),
      'c': (e) => this.#filter.delta('invert', e.shiftKey ? -0.1 : +0.1),
      'v': (e) => this.#filter.delta('grayscale' ,e.shiftKey ? -0.1 : +0.1),
      'z': (e) => this.#filter.delta('zoom', e.shiftKey ? -0.5 : +0.5),
      'b': (e) => this.#filter.delta('blur', e.shiftKey ? -0.1 : +0.1),
      'n': (e) => this.#filter.delta('contrast', e.shiftKey ? -0.1 : +0.1),
      'l': (e) => this.#filter.delta('brightness', e.shiftKey ? -0.1 : +0.1),
      'j': (e) => this.#filter.delta('saturation',e.shiftKey ? -0.1 : +0.1),
      'h': (e) => this.#filter.delta('hue', e.shiftKey ? -15 : +15),
      'g': (e) => this.#filter.reset(),
    },
  };

  #skeleton = {
    html: () => `
    <style>
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: #111;
        color: #fff;
        font-family: sans-serif;
        outline: none;
        user-select: none;
        box-sizing: border-box;
        touch-action: manipulation;
        font-size: 16px;
        --yt-red: #f00;
        overflow: hidden;
      }
      #wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        background: #111;
      }
      #wrapper.hide-control {
        cursor: none;
      }
      #wrapper.hide-control #control {
        opacity: 0;
      }
      video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        transform-origin: center center;
        transition: transform 0.2s ease-out;
      }
      #status {
        position: absolute;
        top: 25px;
        right: 25px;
        background: rgba(0,0,0,0.6);
        color: white;
        padding: 6px 14px;
        border-radius: 4px;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
        z-index: 40;
      }
      #status.show {
        opacity: 1;
      }
      #overlay {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        transform-origin: center center;
        width: 70px;
        height: 70px;
        background: rgba(0,0,0,0.5);
        border-radius: 50%;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        z-index: 30;
        transition: transform 0.3s, opacity 0.3s;
      }
      #overlay svg {
        width: 50px;
        height: 50px;
      }
      #overlay.show {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      #spinner {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 60px;
        height: 60px;
        border: 5px solid rgba(255, 255, 255, 0.3);
        border-top: 5px solid #fff;
        border-radius: 50%;
        opacity: 0;
        pointer-events: none;
        z-index: 2;
      }
      #spinner.show {
        opacity: 1;
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        to { transform: translate(-50%, -50%) rotate(360deg); }
      }
      #control {
        position: absolute;
        bottom: 0; 
        width: 100%;
        padding: 0 12px 8px 12px;
        box-sizing: border-box;
        transition: opacity 0.2s;
        background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
        z-index: 50;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
      }
      #button{
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 48px;
      }
      #leftButton {
        display: flex;
        justify-content: flex-start;
        align-items: center;
      }
      #rightButton {
        display: flex;
        justify-content: flex-end;
        align-items: center;
      }
      #playPause, #muteUnmute, #setting, #expandCollapse {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #playPause svg, #muteUnmute svg, #setting svg, #expandCollapse svg {
        width: 28px;
        height: 28px;
      }
      #muteUnmute {
        margin-right: 15px;
      }
      #mainseek {
        position: relative;
        width: calc(100% - 20px);
        height: 15px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        box-sizing: border-box;
      }
      #mainseekRail {
        position: relative;
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
        transition: height 0.2s;
      }
      #mainseek:hover #mainseekRail {
        height: 5px;
      }
      #mainseekProgressBar {
        position: absolute;
        height: 100%;
        background: var(--yt-red);
        width: 0%;
      }
      #mainseekBufferBar {
        position: absolute;
        height: 100%;
        background: rgba(255,255,255,0.4);
        width: 0%;
      }
      #mainseekLoopBar {
        position: absolute;
        height: 100%;
        background: rgba(255, 207, 0, 0.6);
        width: 0%;
      }
      #mainseekThumb {
        position: absolute;
        right: -6.5px;
        top: 50%;
        transform: translateY(-50%) scale(0);
        width: 13px;
        height: 13px;
        background: var(--yt-red);
        border-radius: 50%;
        transition: transform 0.2s;
      }
      #mainseek:hover #mainseekThumb, #mainseek:active #mainseekThumb {
        transform: translateY(-50%) scale(1);
      }
      #volseek {
        position: relative;
        width: 50px;
        height: 15px;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
      }
      #volseekRail {
        position: relative;
        width: 100%;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
      }
      #volseekProgressBar {
        position: absolute;
        height: 100%;
        background: #fff;
        width: 0%;
      }
      #volseekThumb {
        position: absolute; 
        right: -6px; 
        top: 50%;
        transform: translateY(-50%); 
        width: 13px; 
        height: 13px;
        background: white; 
        border-radius: 50%;
        transition: transform 0.2s;
      }
      #timeDisplay {
        color: white;
        font-size: 13px;
        margin-left: 15px;
        pointer-events: none;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      #range {
        position: absolute;
        bottom: 60px;
        right: 12px;
        background: rgba(28, 28, 28, 0.95);
        width: 250px;
        max-height: 300px;
        border-radius: 8px;
        display: none;
        flex-direction: column;
        overflow-y: auto;
        padding: 8px 0;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        z-index: 60;
        pointer-events: auto;
      }
      #range.show {
        display: flex
      }
      #range::-webkit-scrollbar {
        display :none
      }
      #range div {
        padding: 8px 16px;
        display: flex;
        justify-content: space-between;
        flex-direction: column;
        align-items: flex-start;
        font-size: 13px;
        transition: background 0.2s;
      }
      #range div:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      #range div input {
        -webkit-appearance: none;
        width: 100%;
        height: 16px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
        margin: 10px 0;
        overflow: hidden;
        background-clip: content-box;
        padding: 6px 0;
        box-sizing: border-box;
      }
      #range div input::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 16px;
        height: 16px;
        background: #fff;
        border-radius: 50%;
        cursor: pointer;
        position: relative;
      }
    </style>
    <div id='wrapper'>
      <div id='status'></div>
      <div id='overlay'></div>
      <div id='spinner'></div>
      <div id='control'>
        <div id='mainseek'>
          <div id='mainseekRail'>
            <div id='mainseekBufferBar'></div>
            <div id='mainseekLoopBar'></div>
            <div id='mainseekProgressBar'>
              <div id='mainseekThumb'></div>
            </div>
          </div>
        </div>
        <div id='button'>
          <div id='leftButton'>
            <div id='playPause'>${this.#skeleton.icon.play}</div>
            <div id='muteUnmute'>${this.#skeleton.icon.unmute}</div>
            <div id='volseek'>
              <div id='volseekRail'>
                <div id='volseekProgressBar'>
                  <div id='volseekThumb'></div>
                </div>
              </div>
            </div>
            <div id='timeDisplay'>
              <div id='currentTime'> -- </div>
              <div id='timeSeperator'>&nbsp;/&nbsp;</div>
              <div id='durationTime'> -- </div>
            </div>
          </div>
          <div id='rightButton'>
            <div id='setting'>${this.#skeleton.icon.setting}</div>
            <div id='expandCollapse'>${this.#skeleton.icon.expand}</div>
          </div>
          <div id='range'>
            <div id='speed'>
              <span>speed: <b>${this.#rate.default.toFixed(2)}</b></span>
              <input type='range' min='${this.#rate.min}' max='${this.#rate.max}' step='${this.#rate.step}' value='${this.#rate.default}'>
            </div>
            ${Object.keys(this.#filter).filter(k => typeof this.#filter[k] === 'object').map(k => {
              const f = this.#filter[k];
              return `
              <div id='${k}'>
                <span>${k}: <b>${f.default.toFixed(2)}</b></span>
                <input type='range' min='${f.min}' max='${f.max}' step='${f.step || 0.1}' value='${f.default}'>
              </div>
              `;
              }).join('')}
          </div>
        </div>
      </div>
    </div>
    `,

    icon: {
      play: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M8,5.14V19.14L19,12.14L8,5.14Z' /></svg>`,
      pause: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M14,19H18V5H14M6,19H10V5H6V19Z' /></svg>`,
      unmute: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16.02C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z' /></svg>`,
      mute: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.82 18.83,13.61 18.54,14.33L20,15.79C20.64,14.64 21,13.36 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.48,12.43 16.5,12.22 16.5,12Z' /></svg>`,
      expand: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M7,14H5V19H10V17H7V14M5,10H7V7H10V5H5V10M17,17H14V19H19V14H17V17M14,5V7H17V10H19V5H14Z' /></svg>`,
      collapse: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M5,16H8V19H10V14H5V16M8,8H5V10H10V5H8V8M14,19H16V16H19V14H14V19M16,8V5H14V10H19V8H16Z' /></svg>`,
      setting: `<svg viewBox='0 0 24 24'><path fill='currentColor' d='M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.97 19.05,5.05L16.56,6.05C16.04,5.66 15.47,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.53,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.97 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.53,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.47,18.68 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z' /></svg>`,
    },
  };
}

customElements.define('video-player', VideoPlayer);