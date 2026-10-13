const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const secretClient = new SecretManagerServiceClient();

let smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || '';
let smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '';
let supportEmail = process.env.SUPPORT_EMAIL || 'gameoffortunes777@gmail.com';
let transporter = null;

async function getSecretValue(secretName) {
  const valueFromEnv = process.env[secretName];
  if (valueFromEnv) {
    return valueFromEnv;
  }

  if (!process.env.K_SERVICE && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return '';
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'gameoffortunes-32578';

  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${secretName}/versions/latest`
    });
    return version.payload.data.toString('utf8');
  } catch (error) {
    console.warn(`Secret ${secretName} was not found in Secret Manager or the runtime does not have access.`);
    return '';
  }
}

async function initializeMailerConfig() {
  smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || await getSecretValue('SMTP_USER');
  smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || await getSecretValue('SMTP_PASS');
  supportEmail = process.env.SUPPORT_EMAIL || await getSecretValue('SUPPORT_EMAIL') || supportEmail;

  transporter = smtpUser && smtpPass
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT || 465),
        secure: (process.env.SMTP_SECURE ?? 'true') === 'true' || Number(process.env.SMTP_PORT || 465) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      })
    : null;

  if (!transporter) {
    console.warn('SMTP mailer was not initialized. Set SMTP_USER and SMTP_PASS or configure Google Secret Manager values.');
  }
}

const requestedPort = Number(process.env.PORT || 8080);
// Listen on IPv6 unspecified by default so localhost (::1) resolves correctly
// You can override with the HOST env var (e.g. HOST=0.0.0.0)
const host = process.env.HOST || '::';
let port = requestedPort;

const possibleRoots = [
  path.join(__dirname, 'dist', 'gofv2', 'browser'),
  path.join(__dirname, 'dist', 'gofv2'),
  path.join(__dirname, 'dist', 'browser')
];

const staticRoot = possibleRoots.find((candidate) => fs.existsSync(candidate));

if (!staticRoot) {
  console.error('Static build output not found. Run npm run build first.');
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function resolvePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath);
  const safePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const absolutePath = path.normalize(path.join(staticRoot, safePath.replace(/^\//, '')));

  if (!absolutePath.startsWith(staticRoot)) {
    return path.join(staticRoot, 'index.html');
  }

  return absolutePath;
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    const requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;

    if (requestPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('ok');
      return;
    }

    const targetPath = resolvePath(requestPath);
    const filePath = fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()
      ? targetPath
      : path.join(staticRoot, 'index.html');

    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'text/html; charset=utf-8',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
      });
      res.end();
      return;
    }

    sendFile(res, filePath);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/contact') {
    let rawBody = '';
    req.on('data', (chunk) => {
      rawBody += chunk;
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(rawBody || '{}');
        const email = String(payload.email || '').trim();
        const message = String(payload.message || '').trim();
        const userId = payload.userId ? String(payload.userId) : null;
        const displayName = payload.displayName ? String(payload.displayName) : null;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'A valid email and message are required.' }));
          return;
        }

        if (!transporter) {
          const missingCredentialsMessage = 'Email is not configured on this server. Set SMTP_USER and SMTP_PASS or grant access to Google Secret Manager before sending messages.';
          console.error(missingCredentialsMessage);
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            message: missingCredentialsMessage
          }));
          return;
        }

        const emailText = [
          'New Game of Fortunes contact request',
          '',
          `From: ${email}`,
          userId ? `User ID: ${userId}` : 'User ID: not signed in',
          displayName ? `Display name: ${displayName}` : 'Display name: not provided',
          '',
          'Message:',
          message
        ].join('\n');

        await transporter.sendMail({
          from: `Game of Fortunes Contact <${smtpUser}>`,
          to: supportEmail,
          replyTo: email,
          subject: `Contact form submission from ${email}`,
          text: emailText
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: 'Message sent successfully.' }));
      } catch (error) {
        console.error('Contact form submission failed.', error);
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'Unable to send the contact request right now.' }));
      }
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Method not allowed');
});

function startServer() {
  server.removeAllListeners('error');
  server.on('error', (error) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
      port += 1;
      console.warn(`Port ${requestedPort} is busy, trying ${port} instead.`);
      server.close(() => startServer());
      return;
    }

    console.error(error);
    process.exit(1);
  });

  server.listen(port, host, () => {
    console.log(`Server listening on http://${host}:${port}`);
  });
}

initializeMailerConfig()
  .then(() => startServer())
  .catch((error) => {
    console.error('Failed to initialize mailer secrets.', error);
    startServer();
  });
