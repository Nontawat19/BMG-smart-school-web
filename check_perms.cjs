const fs = require('fs');
const path = require('path');

function checkDir(dir) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          checkDir(fullPath);
        }
      } catch (err) {
        console.error(`Error stat: ${fullPath} - ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`Error readdir: ${dir} - ${err.message}`);
  }
}

checkDir(path.join(__dirname, 'src/pages'));
console.log('Check complete.');
