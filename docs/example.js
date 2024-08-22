import { wavBufferToRawPcm, rawPcmToMsu, WavError, msuToRawPcm, MsuError, rawPcmToWav } from './index.js';

const form = document.querySelector('#formMsu1');

// Wrapper to treat a file input as an ArrayBuffer
const wavAsRawPcm = async (fileInput) => {
  if (fileInput.files.length !== 1) {
    throw new Error("No files selected");
  }
  return wavBufferToRawPcm(await fileInput.files[0].arrayBuffer());
};

const msuAsRawPcm = async (fileInput, options) => {
  if (fileInput.files.length !== 1) {
    throw new Error("No files selected");
  }
  return msuToRawPcm(await fileInput.files[0].arrayBuffer(), options);
};


const pushDownload = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const makeMSU1 = async ({
  source,
  intro,
  loop,
}) => {
  const data = await wavAsRawPcm(source);
  try {
    return rawPcmToMsu(data, { intro: await wavAsRawPcm(intro) });
  } catch (e) {
    // Something was wrong with the file
    if (e instanceof WavError) throw e;
    // No file was selected.
    return rawPcmToMsu(data, { loop });
  }
}

const makeWav = async ({
  source,
  ...options
}) => {
  const { intro, loop, loopPoint } = await msuAsRawPcm(source, options);
  return {
    intro: intro && rawPcmToWav(intro),
    loop: rawPcmToWav(loop),
    loopPoint,
  };
}

let currentLoopPoint = null;
const player = document.querySelector('#player');
const go = document.querySelector('#go');
player.addEventListener('ended', () => {
  if (currentLoopPoint !== null) {
    player.currentTime = currentLoopPoint / 44100;
    player.play();
  }
});
document.querySelector('#source').addEventListener('change', async (e) => {
  const name = e.target.files[0]?.name ?? "";
  
  if (player.src) {
    URL.revokeObjectURL(player.src);
  }
  if (name.endsWith('.wav')) {
    player.src = URL.createObjectURL(e.target.files[0]);
    go.innerHTML = "Download MSU1 PCM";
  } else if (name) {
    const wavBuffers = await makeWav({
      source: e.target,
      packLoop: true,
    });
    currentLoopPoint = wavBuffers.loopPoint;
    const loopBlob = new Blob([wavBuffers.loop], { type: "audio/wav" });
    player.src = URL.createObjectURL(loopBlob);
    go.innerHTML = "Download WAV(s)";
  }
});

form.addEventListener('submit', async (e) => {
  // Form handley stuff
  e.preventDefault();
  e.stopPropagation();

  const sourceInput = e.target.querySelector('#source');
  const name = sourceInput.files[0]?.name ?? "";
  if (name.endsWith('.wav')) {
    try {
      const msu1Buffer = await makeMSU1({
        source: sourceInput,
        intro: e.target.querySelector('#intro'),
        loop: parseInt(e.target.querySelector('#loop').value) ?? 0,
      });
      // Wrap it for download
      const msu1Blob = new Blob([msu1Buffer], { type: "application/octet-stream" });
      const msu1Filename = sourceInput.files[0].name.replace(/\.wav$/, '.pcm');
      pushDownload(msu1Blob, msu1Filename);
    } catch (e) {
      document.querySelector('#error').innerHTML = e.message;
      throw e;
    }
  } else {
    try {
      const wavBuffers = await makeWav({
        source: sourceInput
      });
      // Wrap it for download
      const loopBlob = new Blob([wavBuffers.loop], { type: "audio/wav" });
      const loopFilename = sourceInput.files[0].name.replace(/\.pcm$/, '.wav');
      pushDownload(loopBlob, loopFilename);
      if (wavBuffers.intro) {
        const introBlob = new Blob([wavBuffers.intro], { type: "audio/wav" });
        const introFilename = sourceInput.files[0].name.replace(/\.pcm$/, '.intro.wav');
        pushDownload(introBlob, introFilename);
      }
    } catch (e) {
      document.querySelector('#error').innerHTML = e.message;
      throw e;
    }
  }
  return false;
});