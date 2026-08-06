import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgPath = path.resolve('public/icon.svg');
const publicDir = path.resolve('public');

async function generateIcons() {
  console.log('Reading SVG from:', svgPath);
  const svgBuffer = fs.readFileSync(svgPath);

  // 192x192 PWA Icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-192.png'));
  console.log('Generated public/pwa-192.png (192x192)');

  // 512x512 PWA Icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'pwa-512.png'));
  console.log('Generated public/pwa-512.png (512x512)');

  // Apple Touch Icons (180x180)
  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Generated public/apple-touch-icon.png (180x180)');

  await sharp(svgBuffer)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(publicDir, 'apple-touch-icon-precomposed.png'));
  console.log('Generated public/apple-touch-icon-precomposed.png (180x180)');

  console.log('All PNG icons generated successfully!');
}

generateIcons().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
