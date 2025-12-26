import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pngToIco from 'png-to-ico';
import png2icons from 'png2icons';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.join(__dirname, 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  console.log('Generating icons from SVG...');
  
  // Standard sizes for Tauri + Windows taskbar sizes at various DPI
  const sizes = [
    // Windows taskbar sizes (100%-200% DPI scaling)
    { name: '16x16.png', size: 16 },
    { name: '20x20.png', size: 20 },
    { name: '24x24.png', size: 24 },
    { name: '32x32.png', size: 32 },
    { name: '40x40.png', size: 40 },
    { name: '48x48.png', size: 48 },
    { name: '64x64.png', size: 64 },
    { name: '96x96.png', size: 96 },
    { name: '128x128.png', size: 128 },
    { name: '128x128@2x.png', size: 256 },
    { name: '256x256.png', size: 256 },
    { name: 'icon.png', size: 1024 },
    // Windows Store logos
    { name: 'Square30x30Logo.png', size: 30 },
    { name: 'Square44x44Logo.png', size: 44 },
    { name: 'Square71x71Logo.png', size: 71 },
    { name: 'Square89x89Logo.png', size: 89 },
    { name: 'Square107x107Logo.png', size: 107 },
    { name: 'Square142x142Logo.png', size: 142 },
    { name: 'Square150x150Logo.png', size: 150 },
    { name: 'Square284x284Logo.png', size: 284 },
    { name: 'Square310x310Logo.png', size: 310 },
    { name: 'StoreLogo.png', size: 50 },
  ];

  // Generate PNG files with high quality settings - RGBA with transparent background
  for (const { name, size } of sizes) {
    const outputPath = path.join(iconsDir, name);
    // Render at 4x size then downscale for better quality
    const renderSize = Math.min(size * 4, 2048);
    await sharp(svgBuffer, { density: 300 })
      .resize(renderSize, renderSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(size, size, { 
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFormat('png', { 
        compressionLevel: 9,
        palette: false  // Disable palette to ensure RGBA
      })
      .toFile(outputPath);
    console.log(`Generated: ${name} (${size}x${size})`);
  }

  // Generate ICO file (Windows) - needs multiple sizes including 256 for hi-DPI taskbar
  const icoSizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];
  const icoPngs = [];
  
  for (const size of icoSizes) {
    // Render at much higher resolution then downscale for crisp results
    const pngBuffer = await sharp(svgBuffer, { density: 400 })
      .resize(1024, 1024, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .resize(size, size, { 
        kernel: sharp.kernel.lanczos3,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toFormat('png', { palette: false })
      .toBuffer();
    icoPngs.push(pngBuffer);
  }
  
  const icoBuffer = await pngToIco(icoPngs);
  fs.writeFileSync(path.join(iconsDir, 'icon.ico'), icoBuffer);
  console.log('Generated: icon.ico (with 16, 20, 24, 32, 40, 48, 64, 96, 128, 256 px)');

  // Generate ICNS file (macOS)
  console.log('Generating icon.icns...');
  const pngForIcns = await sharp(svgBuffer, { density: 300 })
    .resize(1024, 1024, { 
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .toFormat('png', { palette: false })
    .toBuffer();
  
  const icnsBuffer = png2icons.createICNS(pngForIcns, png2icons.BICUBIC2, 0);
  if (icnsBuffer) {
    fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icnsBuffer);
    console.log('Generated: icon.icns');
  }
  
  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);
