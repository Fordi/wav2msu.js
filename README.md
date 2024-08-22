# wav2msu.js

A library to encode/decode audio data as MSU-1 compatible PCM.

[Demo](https://fordi.github.io/wav2msu.js)

.wav files should be 16-bit, stereo, 44.1kHz, little-endian.  The codec does no data-wrangling.  If you need that, there are other JS libs
you can wrap around this one.


Based on @jbaiter's [wav2msu implementation in C](https://github.com/jbaiter/wav2msu), which was in turn based on Kawa's C# implementation (which is no longer there).

## Classes

* `WavError` extends Error
* `MsuError` extends Error

These exist so you can differentiate between errors raised when things go wrong.

## Functions

### `wavBufferToRawPcm(wavBuffer:ArrayBuffer):Uint16Array`

Reads a WAV buffer, and returns a Uint16Array into its data area.

| name | description |
|------|-------------|
| wavBuffer | An arraybuffer representing a WAV file. |

returns `Uint16Array` the raw PCM data

### `rawPcmToMsu(pcm:Uint16Array, { intro?:Uint16Array, loop?:number } = {}):ArrayBuffer`

Convert a Uint16Array of samples into an MSU-1 ArrayBuffer.

| name | description |
|------|-------------|
| pcm  | input PCM data, 44.1kHz, stereo, 16 bit |
| intro| optional intro PCM data, 44.1kHz, stereo, 16 bit |
| loop | optional loop point specification, if intro not specified |

### `msuToRawPcm(msuBuffer:ArrayBuffer, { packLoop:boolean }):{ loop:Uint16Array, loopPoint:number, intro:Uint16Array }`

Convert an MSU-1 ArrayBuffer into a raw PCM Uint16Array

| name | description |
|------|-------------|
| msuBuffer | input MSU data |
| packLoop | whether to include the intro and loop into one Uint16Array, or split it between two |

### `rawPcmToWav(pcm:Uint16Array):ArrayBuffer`

Convert a Uint16Array of raw samples to a WAV ArrayBuffer

| name | description |
|------|-------------|
| pcm  | input PCM data, 44.1kHz, stereo, 16 bit |

## Example of use

```javascript
import { wavBufferToRawPcm, rawPcmToMsu } from '@fordi-org/wav2msu';

const form = document.querySelector('#formMsu1');

// Wrapper to treat a file input as an ArrayBuffer
const fileAsRawPcm = async (fileInput) => {
  if (fileInput.files.length !== 1) {
    throw new Error("No files selected");
  }
  return wavBufferToRawPcm(await fileInput.files[0].arrayBuffer());
};

const pushDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: targetFilename });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

form.addEventListener('submit', async (e) => {
  // Form handley stuff
  e.preventDefault();
  e.stopPropagation();

  const sourceInput = e.target.querySelector('#source');
  
  const source = await fileAsRawPcm(sourceInput);
  const options = {};
  try {
    options.intro = await fileAsRawPcm(e.target.querySelector('#intro'));
  } catch (e) { // No intro file selected; fail to user-defined loop point
    options.loop = parseInt(e.target.querySelector('#loop').value) ?? 0;
  }
  // Convert to MSU1 ArrayBuffer
  const msu1Buffer = rawPcmToMsu(source, options);

  // Wrap it for download
  const msu1Blob = new Blob([msu1Buffer], { type: "application/octet-stream" });
  const msu1Filename = sourceInput.files[0].name.replace(/\.wav$/, '.pcm');
  pushDownload(msu1Blob, msu1Filename);
  
  return false;
});
```

See `docs/example.js` for a more robust example of use.


## MSU-1 Format

Near's old Byuu site is gone, so I'm putting this here for posterity.
It's relatively simple.  Multibyte numbers are little-endian.

| name | type | description |
|------|------|-------------|
| magic| string| "MSU1"     |
| loop | uint32| sample number to loop back at |
| data | uint16* | 16-bit, stereo, PCM data |

Also, pour one out for [Near](https://en.wikipedia.org/wiki/Near_%28programmer%29); they did so much for the emu community.
