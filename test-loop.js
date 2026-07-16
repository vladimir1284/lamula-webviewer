import fs from 'fs';
const file = 'pages/[site]/[product]/[[time]].vue';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(
  `watch(() => animFrames.value, (frames) => {`,
  `window.__setFramesCount = (window.__setFramesCount || 0) + 1;
console.log("SET_FRAMES_TRIGGERED", window.__setFramesCount, frames?.length, activeFrameIndex.value, new Error().stack);
watch(() => animFrames.value, (frames) => {`
);
fs.writeFileSync(file, content);
