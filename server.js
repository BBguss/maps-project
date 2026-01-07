import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Helper to handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the 'dist' directory (created by 'npm run build')
app.use(express.static(path.join(__dirname, 'dist')));

// Handle Single Page Application (SPA) routing
// If a request doesn't match a static file, send index.html
// This ensures reloading on /adm works correctly
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server is running in production mode!`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
  console.log(`➜  Admin:   http://localhost:${PORT}/adm\n`);
});