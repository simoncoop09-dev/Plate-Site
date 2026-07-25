// Pulls the current production site into www/ so the app bundles it locally.
// Apple rejects apps that are just a remote-URL webview; bundling assets
// locally (with API calls going to your live backend) is the accepted pattern.
const fs = require('fs');
const https = require('https');

const SITE = process.env.PLATE_SITE_URL || 'https://YOUR-SITE.vercel.app';
const FILES = ['index.html', 'manifest.json', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

fs.mkdirSync('www', { recursive: true });

function fetchFile(path) {
  return new Promise((resolve, reject) => {
    https.get(SITE + '/' + path, res => {
      if (res.statusCode !== 200) return reject(new Error(path + ': ' + res.statusCode));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        if (path === 'index.html') {
          // API calls must hit the live backend, not the local bundle
          let html = buf.toString('utf8');
          html = html.replace(/fetch\('\/api\//g, "fetch('" + SITE + "/api/");
          buf = Buffer.from(html, 'utf8');
        }
        fs.writeFileSync('www/' + path, buf);
        console.log('saved', path);
        resolve();
      });
    }).on('error', reject);
  });
}

(async () => {
  for (const f of FILES) await fetchFile(f);
  console.log('done — now run: npx cap sync ios');
})();
