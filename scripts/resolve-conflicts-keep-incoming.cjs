const fs = require('fs');
const path = require('path');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', '.history', '.vscode', '.github'].includes(entry.name)) continue;
      walk(full);
    } else if (entry.isFile()) {
      try {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes('([\s\S]*?)
          // Replace each block with the incoming (captured group 1)
          const newContent = content.replace(re, (m, incoming) => {
            // Trim leading/trailing newlines from incoming
            return incoming.replace(/^\r?\n|\r?\n$/g, '') + '\n';
          });
          if (newContent !== content) {
            fs.writeFileSync(full, newContent, 'utf8');
            console.log('Fixed', full);
          }
        }
      } catch (err) {
        // ignore binary files or read errors
      }
    }
  }
}

const root = process.cwd();
console.log('Resolving conflicts in', root);
walk(root);
console.log('Done');
