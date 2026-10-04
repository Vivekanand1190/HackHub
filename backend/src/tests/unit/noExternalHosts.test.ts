import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== 'dist' && file !== 'build') {
        getAllFiles(filePath, arrayOfFiles);
      }
    } else if (/\.(ts|tsx|js|jsx|css|html)$/.test(file)) {
      arrayOfFiles.push(filePath);
    }
  });

  return arrayOfFiles;
}

describe('Local-Only Outbound Network Audit', () => {
  it('should not contain any third-party SaaS or CDN external host URLs in runtime code', () => {
    const backendSrc = path.join(__dirname, '../../');
    const frontendSrc = path.join(__dirname, '../../../../frontend/src');

    const files = [...getAllFiles(backendSrc), ...getAllFiles(frontendSrc)];
    const urlRegex = /(https?|wss?):\/\/([^\s'"`()<>{}]+)/gi;

    const allowedHosts = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'w3.org', // XML/SVG namespace definition
      'github.com', // Display link prefix for user-entered repo URLs
    ];

    const violations: { file: string; url: string }[] = [];

    files.forEach((filePath) => {
      // Ignore test files themselves from strict checks
      if (filePath.includes('.test.') || filePath.includes('__tests__')) return;

      const content = fs.readFileSync(filePath, 'utf-8');
      let match;
      while ((match = urlRegex.exec(content)) !== null) {
        const fullUrl = match[0];
        const hostMatch = fullUrl.match(/(https?|wss?):\/\/([^\/:]+)/i);
        const host = hostMatch ? hostMatch[2].toLowerCase() : '';

        const isAllowed = allowedHosts.some((allowed) => host === allowed || host.endsWith('.' + allowed));
        if (!isAllowed) {
          violations.push({ file: path.basename(filePath), url: fullUrl });
        }
      }
    });

    expect(violations).toEqual([]);
  });
});
