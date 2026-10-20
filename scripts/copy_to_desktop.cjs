const fs = require('fs');
const path = require('path');

const srcRoot = path.resolve(__dirname, '..');
const desktopFolder = 'C:\\Users\\LENOVO\\Desktop\\nexus outbound';
const codeFolder = path.join(desktopFolder, '02_Codigo_Fuente_App');

fs.mkdirSync(codeFolder, { recursive: true });

const excludeList = new Set(['node_modules', '.git', 'dist', '.vercel']);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    if (excludeList.has(entry.name) || entry.name.endsWith('.log')) continue;

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(srcRoot, codeFolder);
console.log('✅ Código fuente copiado limpiamente a:', codeFolder);
