#!/usr/bin/env node

const { execSync } = require('child_process');
const { readdirSync, statSync } = require('fs');
const { join } = require('path');

function findTsFiles(dir) {
  const results = [];
  try {
    const files = readdirSync(dir);
    for (const file of files) {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        results.push(...findTsFiles(filePath));
      } else if (file.endsWith('.ts')) {
        results.push(filePath);
      }
    }
  } catch (err) {
    // Directory doesn't exist or can't be read
  }
  return results;
}

const tsFiles = findTsFiles('lib');

if (tsFiles.length === 0) {
  console.log('No TypeScript files found in lib/. Skipping TypeScript compilation.');
  process.exit(0);
}

try {
  execSync('tsc', { stdio: 'inherit' });
} catch (error) {
  process.exit(error.status || 1);
}
