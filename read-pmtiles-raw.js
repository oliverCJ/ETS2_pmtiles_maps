import fs from 'fs';

const filePath = process.argv[2] || 'output/ets2.pmtiles';

// Read PMTiles header (127 bytes)
const buffer = fs.readFileSync(filePath);

// Check magic number
const magic = buffer.toString('utf8', 0, 7);
console.log('Magic:', magic);

// Read header fields
const version = buffer.readUInt8(7);
console.log('Version:', version);

// Read metadata offset and length
const metadataOffset = Number(buffer.readBigUInt64LE(15));
const metadataLength = Number(buffer.readBigUInt64LE(23));

console.log('Metadata offset:', metadataOffset);
console.log('Metadata length:', metadataLength);

if (metadataLength > 0 && metadataLength < 10000000) {
  // Read metadata
  const metadataBuffer = buffer.slice(metadataOffset, metadataOffset + metadataLength);

  // Try to decompress if it's gzipped
  try {
    const zlib = await import('zlib');

    // Use promisified gunzip
    const decompressed = await new Promise((resolve, reject) => {
      zlib.gunzip(metadataBuffer, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    const metadata = JSON.parse(decompressed.toString('utf8'));
    console.log('\n=== Metadata ===');
    console.log(JSON.stringify(metadata, null, 2));
  } catch (e) {
    console.log('Decompression error:', e.message);
    // Not compressed, try direct parse
    try {
      const metadata = JSON.parse(metadataBuffer.toString('utf8'));
      console.log('\n=== Metadata ===');
      console.log(JSON.stringify(metadata, null, 2));
    } catch (e2) {
      console.log('Failed to parse metadata:', e2.message);
    }
  }
}
