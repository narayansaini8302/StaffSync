const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const DIST = path.join(__dirname, '..', 'dist');

function copyHbs(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyHbs(srcPath, destPath);
    } else if (entry.name.endsWith('.hbs')) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied ${path.relative(process.cwd(), destPath)}`);
    }
  }
}

copyHbs(SRC, DIST);
console.log('✓ Templates copied to dist/');