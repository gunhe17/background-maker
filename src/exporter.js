/**
 * Video export pipeline using FFmpeg.wasm.
 *
 * Quality-focused pipeline:
 *  1. PNG frames (lossless)       → no source compression artifacts
 *  2. Canvas reuse via initExport → zero per-frame GC pressure
 *  3. -preset medium              → good quality/speed balance
 *  4. -crf 14 (near-lossless)    → high fidelity output
 *  5. yuv444p                     → full chroma resolution for gradients
 *
 * We bypass the @ffmpeg/ffmpeg FFmpeg class because it always creates a
 * type:"module" Worker, and module Workers cannot use importScripts().
 * Instead we create a classic Worker directly and speak the same message
 * protocol that the FFmpeg class expects.
 */

import { renderer } from './aurora.js';

const exportBtn = document.getElementById('export-btn');
const progressContainer = document.getElementById('export-progress');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

let isExporting = false;

exportBtn.addEventListener('click', startExport);

async function startExport() {
  if (isExporting) return;
  isExporting = true;
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exporting...';
  exportBtn.classList.add('opacity-50', 'cursor-not-allowed');
  progressContainer.classList.remove('hidden');

  try {
    const resolutionStr = document.getElementById('resolution').value;
    const [exportWidth, exportHeight] = resolutionStr.split('x').map(Number);
    const duration = parseInt(document.getElementById('duration').value);
    const fps = parseInt(document.getElementById('fps').value);
    const totalFrames = fps * duration;

    updateProgress(0, totalFrames, 'Loading FFmpeg...');

    const ffmpeg = createFFmpegWorker();

    const base = import.meta.env.BASE_URL || '/';
    const coreURL = new URL(`${base}ffmpeg/ffmpeg-core.js`, window.location.href).toString();
    const wasmURL = new URL(`${base}ffmpeg/ffmpeg-core.wasm`, window.location.href).toString();

    await ffmpeg.load({
      coreURL,
      wasmURL,
    });

    updateProgress(0, totalFrames, 'Rendering frames...');

    // Prepare reusable canvases (no per-frame allocation)
    renderer.initExport(exportWidth, exportHeight);

    // All layer cycles are integers → frame at time=0 and time=duration are
    // mathematically identical, so no crossfade is needed for seamless looping.
    // Frames are encoded as PNG (lossless) for maximum quality.
    for (let i = 0; i < totalFrames; i++) {
      const time = (i / fps) * 1000;
      const outCanvas = renderer.renderExportFrame(time);

      const blob = await canvasToBlob(outCanvas, 'image/png');
      const data = new Uint8Array(await blob.arrayBuffer());

      const frameName = `frame_${String(i).padStart(5, '0')}.png`;
      await ffmpeg.writeFile(frameName, data);

      updateProgress(i + 1, totalFrames, `Rendering frame ${i + 1} / ${totalFrames}`);
    }

    renderer.cleanupExport();

    ffmpeg.onProgress((pct) => {
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `Encoding video... ${pct}%`;
    });

    const exitCode = await ffmpeg.exec([
      '-framerate', String(fps),
      '-i', 'frame_%05d.png',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '14',
      '-pix_fmt', 'yuv444p',
      '-color_range', 'pc',
      '-colorspace', 'bt709',
      '-color_trc', 'bt709',
      '-color_primaries', 'bt709',
      '-movflags', '+faststart',
      'output.mp4',
    ]);

    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}`);
    }

    const outputData = await ffmpeg.readFile('output.mp4');
    const mp4Blob = new Blob([outputData.buffer], { type: 'video/mp4' });

    const url = URL.createObjectURL(mp4Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `background-${exportWidth}x${exportHeight}-${fps}fps.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    for (let i = 0; i < totalFrames; i++) {
      const frameName = `frame_${String(i).padStart(5, '0')}.png`;
      try { await ffmpeg.deleteFile(frameName); } catch (_) {}
    }
    try { await ffmpeg.deleteFile('output.mp4'); } catch (_) {}

    ffmpeg.terminate();
    updateProgress(totalFrames, totalFrames, 'Export complete!');
  } catch (err) {
    console.error('Export failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    progressText.textContent = `Export failed: ${msg}`;
  } finally {
    isExporting = false;
    exportBtn.disabled = false;
    exportBtn.textContent = 'Export Video';
    exportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    setTimeout(() => {
      progressContainer.classList.add('hidden');
    }, 3000);
  }
}

function updateProgress(current, total, message) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = message;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

// ─── Custom FFmpeg Worker wrapper ───────────────────────────────────
// Creates a *classic* Worker (not module) so importScripts() works,
// and exposes the same high-level API (load, exec, writeFile, etc.).

function createFFmpegWorker() {
  const workerCode = `
let ffmpeg;
const T = {
  LOAD:"LOAD",EXEC:"EXEC",WRITE_FILE:"WRITE_FILE",READ_FILE:"READ_FILE",
  DELETE_FILE:"DELETE_FILE",RENAME:"RENAME",CREATE_DIR:"CREATE_DIR",
  LIST_DIR:"LIST_DIR",DELETE_DIR:"DELETE_DIR",ERROR:"ERROR",
  DOWNLOAD:"DOWNLOAD",PROGRESS:"PROGRESS",LOG:"LOG",
  MOUNT:"MOUNT",UNMOUNT:"UNMOUNT"
};

async function load({ coreURL, wasmURL, workerURL }) {
  const first = !ffmpeg;
  importScripts(coreURL);
  if (!self.createFFmpegCore) throw new Error("failed to import ffmpeg-core.js");
  const wURL = wasmURL || coreURL.replace(/.js$/, ".wasm");
  const mainScriptUrlOrBlob =
    coreURL +
    "#" +
    btoa(JSON.stringify({ wasmURL: wURL, workerURL }));

  ffmpeg = await self.createFFmpegCore({ mainScriptUrlOrBlob });
  ffmpeg.setLogger((data) => self.postMessage({ type: T.LOG, data }));
  ffmpeg.setProgress((data) => self.postMessage({ type: T.PROGRESS, data }));
  return first;
}

function exec({ args, timeout = -1 }) {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
}

self.onmessage = async ({ data: { id, type, data: _data } }) => {
  const trans = [];
  let data;
  try {
    if (type !== T.LOAD && !ffmpeg) throw new Error("ffmpeg is not loaded");
    switch (type) {
      case T.LOAD: data = await load(_data); break;
      case T.EXEC: data = exec(_data); break;
      case T.WRITE_FILE: ffmpeg.FS.writeFile(_data.path, _data.data); data = true; break;
      case T.READ_FILE: data = ffmpeg.FS.readFile(_data.path, { encoding: _data.encoding }); break;
      case T.DELETE_FILE: ffmpeg.FS.unlink(_data.path); data = true; break;
      case T.RENAME: ffmpeg.FS.rename(_data.oldPath, _data.newPath); data = true; break;
      case T.CREATE_DIR: ffmpeg.FS.mkdir(_data.path); data = true; break;
      case T.LIST_DIR: {
        const names = ffmpeg.FS.readdir(_data.path);
        data = names.map(name => {
          const stat = ffmpeg.FS.stat(_data.path + "/" + name);
          return { name, isDir: ffmpeg.FS.isDir(stat.mode) };
        });
        break;
      }
      case T.DELETE_DIR: ffmpeg.FS.rmdir(_data.path); data = true; break;
      case T.MOUNT: {
        const fs = ffmpeg.FS.filesystems[_data.fsType];
        if (!fs) { data = false; break; }
        ffmpeg.FS.mount(fs, _data.options, _data.mountPoint);
        data = true; break;
      }
      case T.UNMOUNT: ffmpeg.FS.unmount(_data.mountPoint); data = true; break;
      default: throw new Error("unknown message type");
    }
  } catch (e) {
    self.postMessage({ id, type: T.ERROR, data: e.toString() });
    return;
  }
  if (data instanceof Uint8Array) trans.push(data.buffer);
  self.postMessage({ id, type, data }, trans);
};
`;

  const blob = new Blob([workerCode], { type: 'text/javascript' });
  const worker = new Worker(URL.createObjectURL(blob));

  let nextId = 0;
  const resolves = {};
  const rejects = {};
  let progressCb = null;

  worker.onmessage = ({ data: { id, type, data } }) => {
    if (type === 'LOG') {
      console.log('[ffmpeg]', data?.message ?? data);
      return;
    }
    if (type === 'PROGRESS') {
      if (progressCb && data) {
        const pct = Math.round(Math.max(0, Math.min(1, data.progress ?? 0)) * 100);
        progressCb(pct);
      }
      return;
    }
    if (type === 'ERROR') {
      if (rejects[id]) rejects[id](new Error(data));
      delete resolves[id];
      delete rejects[id];
      return;
    }
    if (resolves[id]) resolves[id](data);
    delete resolves[id];
    delete rejects[id];
  };

  function send(type, data) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      resolves[id] = resolve;
      rejects[id] = reject;
      const trans = [];
      if (data?.data instanceof Uint8Array) trans.push(data.data.buffer);
      worker.postMessage({ id, type, data }, trans);
    });
  }

  return {
    load: (config) => send('LOAD', config),
    exec: (args) => send('EXEC', { args }),
    writeFile: (path, data) => send('WRITE_FILE', { path, data }),
    readFile: (path, encoding) => send('READ_FILE', { path, encoding }),
    deleteFile: (path) => send('DELETE_FILE', { path }),
    onProgress: (cb) => { progressCb = cb; },
    terminate: () => worker.terminate(),
  };
}
