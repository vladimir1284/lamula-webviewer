const fs = require('fs');
const unzipper = require('unzipper');

fs.createReadStream('test-results/animation-animación-play-a-aa177-se-venía-viendo-sin-errores-chromium/trace.zip')
  .pipe(unzipper.Parse())
  .on('entry', function (entry) {
    if (entry.path.endsWith('.network')) {
      entry.pipe(process.stdout);
    } else {
      entry.autodrain();
    }
  });
