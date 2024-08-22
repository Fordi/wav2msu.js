export class WavError extends Error {}

/**
 * Get a string from a DataView
 * @param {DataView} view
 * @param {number} offset
 * @param {number} length
 * @returns {string}
 */
function getString(view, offset, length) {
  const result = [];
  for (let i = offset; i < offset + length; i++) {
    result.push(String.fromCharCode(view.getUint8(i)));
  }
  return result.join('');
}

/**
 * Put a string into a DataView
 * @param {DataView} view
 * @param {number} offset
 * @param {string} string
 */
function putString(view, offset, string) {
  const chars = [...string];
  for (let index = 0; index < chars.length; index++) {
    view.setUint8(offset + index, chars[index].charCodeAt(0));
  }
}

/**
 * Parse a WAV file into a Record, keyed by chunk name
 * @param {ArrayBuffer} wavBuffer 
 * @returns {Record<string, DataView>}
 */
function parseWavFile(wavBuffer) {
  const view = new DataView(wavBuffer);
  // The middle 4 bytes are the total file size, minus the RIFF and WAVE magics
  const magic = [getString(view, 0, 4), getString(view, 8, 4)].join('/');
  if (magic !== 'RIFF/WAVE') {
    throw new WavError(`Not a WAV file; expected RIFF/WAVE, got "${magic}"`);
  }
  const size = view.getUint32(4, true) + 8;
  if (size !== view.byteLength) {
    throw new WavError(`File size (${view.byteLength}) differs from recorded data size (${size}); giving up`);
  }

  let pos = 12;
  const chunks = {};
  while (pos < view.byteLength) {
    const chunkName = getString(view, pos, 4).trim().replace(/\0/g, '');
    const length = view.getUint32(pos + 4, true);
    chunks[chunkName] = new DataView(wavBuffer, pos + 8, length);
    pos += length + 8;
  }
  return chunks;
}

/**
 * Parse the `fmt` chunk.  Does not support variants.
 * @param {DataView} view fmt chunk data
 * @returns {object}
 */
function parseFMT(view) {
  return {
    formatTag: view.getUint16(0, true),
    channels: view.getUint16(2, true),
    samplesPerSec: view.getUint32(4, true),
    avgBytesPerSec: view.getUint32(8, true),
    blockAlign: view.getUint16(12, true),
    bitsPerSample: view.getUint16(14, true),
  };
}

/**
 * Reads a WAV buffer, and returns a Uint16Array into its data area.
 * @param {ArrayBuffer} wavBuffer An arraybuffer representing a WAV file.
 * @returns {Uint16Array} the raw PCM data
 */
export function wavBufferToRawPcm(wavBuffer) {
  const chunks = parseWavFile(wavBuffer);
  if (!("fmt" in chunks)) throw new WavError(`no "fmt" chunk`);

  const fmt = parseFMT(chunks.fmt);

  if (fmt.formatTag !== 1) throw new WavError(`Format should be PCM (1); got ${fmt.formatTag}`);
  if (fmt.channels !== 2) throw new WavError(`Expected 2 channels; got ${fmt.channels}`);
  if (fmt.samplesPerSec !== 44100) throw new WavError(`Expected a rate of 44.1 kHz; got ${fmt.samplesPerSec / 1000} kHz`);
  if (fmt.bitsPerSample !== 16) throw new WavError(`Expected 16-bit samples, got ${fmt.bitsPerSample}`);

  if (!("data" in chunks)) throw new WavError(`no "data" chunk`);
  return new Uint16Array(wavBuffer, chunks.data.byteOffset, chunks.data.byteLength * 8 / fmt.bitsPerSample);
};

/**
 * Convert a raw stereo-interleaved PCM Uint16Array to an MSU1 ArrayBuffer
 * @param {Uint16Array} pcm input PCM data
 * @param {Object} options
 * @param {Uint16Array} [options.intro=null] input PCM data for an intro; use to concatenate two files, looping at the start of the second
 * @param {number} [options.loop] loop at `loop` samples from the start
 * @returns {ArrayBuffer} MSU1 file buffer
 */
export function rawPcmToMsu(
  pcm,
  {
    intro = null,
    loop = 0,
  } = {},
) {
  if (intro) {
    loop = intro.length / 2;
  }
  const introOfs = 8 + (intro?.byteLength ?? 0);
  const out = (new Uint8Array(introOfs + pcm.byteLength)).buffer;
  const view = new DataView(out);
  putString(view, 0, 'MSU1');
  view.setUint32(4, loop, true);
  if (intro) {
    for (let i = 0; i < intro.length; i++) {
      view.setUint16(8 + i * 2, intro[i]);
    }
  }
  for (let i = 0; i < pcm.length; i++) {
    view.setUint16(introOfs + i * 2, pcm[i], true);
  }
  return out;
};

/**
 * @typedef RawLoopedPCM
 * @property {Uint16Array} loop
 * @property {Uint16Array|undefined} intro
 */
export class MsuError extends Error {}

/**
 * @param {ArrayBuffer} msuBuffer 
 * @returns {RawLoopedPCM}
 */
export function msuToRawPcm(msuBuffer, { packLoop } = {}) {
  const view = new DataView(msuBuffer);
  if (getString(view, 0, 4) !== 'MSU1') throw new MsuError("Not an MSU1 file");
  const loopPoint = view.getUint32(4, true);
  if (loopPoint > (msuBuffer.byteLength - 8) / 2) {
    throw new MsuError(`Loop point (${loopPoint}) is larger than the number of samples in the file (${(msuBuffer.byteLength - 8) / 2})`);
  }
  if (loopPoint === 0 || packLoop) {
    return {
      loop: new Uint16Array(msuBuffer, 8, (msuBuffer.byteLength - 8) / 2),
      loopPoint,
    };
  }
  return {
    intro: new Uint16Array(msuBuffer, 8, loopPoint),
    loop: new Uint16Array(msuBuffer, 8 + loopPoint * 4, (msuBuffer.byteLength - 8) / 2 - loopPoint * 2),
  };
};

export function rawPcmToWav(pcm) {
  const size = 44 + pcm.byteLength;
  const wavFile = (new Uint8Array(size)).buffer;
  const view = new DataView(wavFile);
  let ofs = 0;
  putString(view, ofs, 'RIFF'); ofs += 4;
  view.setUint32(ofs, size - 8, true); ofs += 4;
  putString(view, ofs, 'WAVE'); ofs += 4;
  putString(view, ofs, 'fmt '); ofs += 4;
  view.setUint32(ofs, 16, true); ofs += 4; // fmt chunk length
  view.setUint16(ofs, 1, true); ofs += 2;// PCM
  view.setUint16(ofs, 2, true); ofs += 2; // stereo
  view.setUint32(ofs, 44100, true); ofs += 4; // sample rate = 44.1kHz
  view.setUint32(ofs, 44100 * 16 * 2 / 8, true); ofs += 4; // data rate = 44.1 kHz * (16 bits / sample) * 2 channels / (8 bits / byte)
  view.setUint16(ofs, 4, true); ofs += 2; // bytes per frame
  view.setUint16(ofs, 16, true); ofs += 2; // bits per sample
  putString(view, ofs, 'data'); ofs += 4;
  view.setUint32(ofs, pcm.byteLength, true); ofs += 4;
  for (let i = 0; i < pcm.length; i++) {
    try {
      view.setUint16(ofs, pcm[i], true); ofs += 2;
    } catch (e) {
      throw new Error(`${e.message}\n${ofs}, ${pcm.byteLength}`);
    }
  }
  return wavFile;
}