/**
 * Генерация иконок приложения из SVG-маскота.
 * Создаёт:
 *  - assets/icons/icon.png        (512x512, для Linux и electron-builder)
 *  - assets/icons/icon@2x.png     (1024x1024)
 *  - assets/icons/icon.icns       (macOS, через png2icns или ручная сборка)
 *  - assets/icons/icon.ico        (Windows, через sharp)
 *  - assets/icons/iconset/        (набор PNG для .icns)
 */

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SVG_PATH = path.join(ROOT, "assets/icons/icon.svg");
const ICONS_DIR = path.join(ROOT, "assets/icons");
const ICONSET_DIR = path.join(ICONS_DIR, "icon.iconset");

// Размеры для macOS .iconset (требование Apple)
const MAC_SIZES = [16, 32, 64, 128, 256, 512, 1024];

// Размеры для Windows .ico (стандарт)
const WIN_SIZES = [16, 32, 48, 64, 128, 256];

async function main() {
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  const svgBuffer = fs.readFileSync(SVG_PATH);

  console.log("📐 Генерация PNG иконок...");

  // Генерируем все нужные размеры
  const allSizes = [...new Set([...MAC_SIZES, ...WIN_SIZES, 512])].sort((a, b) => a - b);

  const pngBuffers = {};
  for (const size of allSizes) {
    const buf = await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toBuffer();
    pngBuffers[size] = buf;
    process.stdout.write(`  ${size}x${size} `);
  }
  console.log("\n✅ PNG сгенерированы");

  // Сохраняем основной icon.png (512x512)
  fs.writeFileSync(path.join(ICONS_DIR, "icon.png"), pngBuffers[512]);
  fs.writeFileSync(path.join(ICONS_DIR, "icon@2x.png"), pngBuffers[1024]);
  console.log("✅ icon.png (512px) и icon@2x.png (1024px) сохранены");

  // Сохраняем iconset для macOS
  // Именование: icon_NxN.png и icon_NxN@2x.png
  const iconsetMap = {
    "icon_16x16.png": 16,
    "icon_16x16@2x.png": 32,
    "icon_32x32.png": 32,
    "icon_32x32@2x.png": 64,
    "icon_128x128.png": 128,
    "icon_128x128@2x.png": 256,
    "icon_256x256.png": 256,
    "icon_256x256@2x.png": 512,
    "icon_512x512.png": 512,
    "icon_512x512@2x.png": 1024,
  };

  for (const [filename, size] of Object.entries(iconsetMap)) {
    fs.writeFileSync(path.join(ICONSET_DIR, filename), pngBuffers[size]);
  }
  console.log("✅ icon.iconset создан (" + Object.keys(iconsetMap).length + " файлов)");

  // Создаём .icns вручную (формат ICNS)
  // electron-builder может использовать PNG напрямую на Linux,
  // поэтому также генерируем .icns через ручную сборку бинарного формата
  const icnsBuffer = buildIcns(pngBuffers);
  fs.writeFileSync(path.join(ICONS_DIR, "icon.icns"), icnsBuffer);
  console.log("✅ icon.icns создан (" + (icnsBuffer.length / 1024).toFixed(1) + " KB)");

  // Создаём .ico для Windows (multi-size ICO)
  const icoBuffer = buildIco(pngBuffers, WIN_SIZES);
  fs.writeFileSync(path.join(ICONS_DIR, "icon.ico"), icoBuffer);
  console.log("✅ icon.ico создан (" + (icoBuffer.length / 1024).toFixed(1) + " KB)");

  console.log("\n🎉 Все иконки успешно сгенерированы в assets/icons/");
}

/**
 * Строим ICNS-файл вручную.
 * Формат: 4-байтный magic 'icns' + 4-байтный размер файла + блоки [OSType(4) + size(4) + data]
 *
 * Поддерживаемые OSType:
 *   ic07 = 128px  ic08 = 256px  ic09 = 512px  ic10 = 1024px
 *   ic04 = 16px   ic05 = 32px
 */
function buildIcns(pngBuffers) {
  const icons = [
    { ostype: "ic04", size: 16 },
    { ostype: "ic05", size: 32 },
    { ostype: "ic07", size: 128 },
    { ostype: "ic08", size: 256 },
    { ostype: "ic09", size: 512 },
    { ostype: "ic10", size: 1024 },
  ];

  const chunks = [];
  for (const { ostype, size } of icons) {
    const png = pngBuffers[size];
    if (!png) continue;

    // Каждый chunk: 4 байта OSType + 4 байта (длина chunk = 8 + длина данных) + данные
    const chunkSize = 8 + png.length;
    const chunk = Buffer.alloc(chunkSize);
    chunk.write(ostype, 0, "ascii");          // OSType
    chunk.writeUInt32BE(chunkSize, 4);        // размер блока
    png.copy(chunk, 8);                       // PNG данные
    chunks.push(chunk);
  }

  const totalSize = 8 + chunks.reduce((s, c) => s + c.length, 0);
  const icns = Buffer.alloc(totalSize);

  // Заголовок
  icns.write("icns", 0, "ascii");
  icns.writeUInt32BE(totalSize, 4);

  // Копируем блоки
  let offset = 8;
  for (const chunk of chunks) {
    chunk.copy(icns, offset);
    offset += chunk.length;
  }

  return icns;
}

/**
 * Строим ICO-файл вручную (Windows icon format).
 * Структура:
 *  - ICONDIR header (6 bytes)
 *  - N × ICONDIRENTRY (16 bytes each)
 *  - N × PNG data
 */
function buildIco(pngBuffers, sizes) {
  const entries = sizes
    .filter((s) => pngBuffers[s])
    .map((size) => ({ size, data: pngBuffers[size] }));

  const headerSize = 6;
  const entrySize = 16;
  const dirSize = headerSize + entries.length * entrySize;

  // Считаем суммарный размер
  let dataOffset = dirSize;
  const offsets = [];
  for (const entry of entries) {
    offsets.push(dataOffset);
    dataOffset += entry.data.length;
  }

  const totalSize = dataOffset;
  const ico = Buffer.alloc(totalSize);

  // ICONDIR
  ico.writeUInt16LE(0, 0);              // Reserved = 0
  ico.writeUInt16LE(1, 2);              // Type = 1 (ICO)
  ico.writeUInt16LE(entries.length, 4); // Count

  // ICONDIRENTRY для каждой иконки
  for (let i = 0; i < entries.length; i++) {
    const { size, data } = entries[i];
    const base = headerSize + i * entrySize;
    ico.writeUInt8(size >= 256 ? 0 : size, base);      // Width (0 = 256)
    ico.writeUInt8(size >= 256 ? 0 : size, base + 1);  // Height (0 = 256)
    ico.writeUInt8(0, base + 2);                        // ColorCount
    ico.writeUInt8(0, base + 3);                        // Reserved
    ico.writeUInt16LE(1, base + 4);                     // Planes
    ico.writeUInt16LE(32, base + 6);                    // BitCount
    ico.writeUInt32LE(data.length, base + 8);           // SizeInBytes
    ico.writeUInt32LE(offsets[i], base + 12);           // ImageOffset
  }

  // PNG данные
  let offset = dirSize;
  for (const { data } of entries) {
    data.copy(ico, offset);
    offset += data.length;
  }

  return ico;
}

main().catch((err) => {
  console.error("❌ Ошибка генерации иконок:", err);
  process.exit(1);
});
