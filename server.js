import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helper to handle __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Increase payload limit for Base64 images
app.use(express.json({ limit: '50mb' }));

// Serve static files from the 'dist' directory
app.use(express.static(path.join(__dirname, 'dist')));
// Serve uploaded images securely (optional, useful if admin wants to view directly via link)
app.use('/uploads', express.static(uploadDir));

// API Endpoint to save capture locally
app.post('/api/capture', (req, res) => {
  const { image_data, device_id, timestamp } = req.body;

  if (image_data) {
    try {
      // Remove header (data:image/jpeg;base64,)
      const base64Data = image_data.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');
      
      const filename = `${device_id}_${timestamp || Date.now()}.jpg`;
      const filePath = path.join(uploadDir, filename);

      fs.writeFile(filePath, buffer, (err) => {
        if (err) {
          console.error('Error saving file:', err);
          return res.status(500).json({ error: 'Failed to save image' });
        }
        console.log(`[SAVED] Image saved to uploads/${filename}`);
        return res.json({ success: true, file: filename });
      });
    } catch (e) {
      console.error('Error processing image:', e);
      return res.status(500).json({ error: 'Invalid image data' });
    }
  } else {
    // If no image, just acknowledge the log
    console.log(`[LOG] Data received from ${device_id}`);
    res.json({ success: true });
  }
});

// Handle Single Page Application (SPA) routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server is running in production mode!`);
  console.log(`➜  Local:   http://localhost:${PORT}`);
  console.log(`➜  Admin:   http://localhost:${PORT}/adm`);
  console.log(`➜  Storage: ${uploadDir}\n`);
});