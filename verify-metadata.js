import fs from 'fs';
import zlib from 'zlib';

const filePath = process.argv[2] || './output/europe.pmtiles';

const buffer = fs.readFileSync(filePath);

// Read PMTiles v3 header
const metadataOffset = Number(buffer.readBigUInt64LE(24));
const metadataLength = Number(buffer.readBigUInt64LE(32));
const internalCompression = buffer.readUInt8(97);

console.log(`Metadata offset: ${metadataOffset}`);
console.log(`Metadata length: ${metadataLength}`);
console.log(`Internal compression: ${internalCompression} (2=Gzip, 1=None)`);

if (metadataOffset === 0 || metadataLength === 0) {
  console.log('No metadata found');
  process.exit(1);
}

// Read and decompress metadata
const metadataBuffer = buffer.subarray(
  metadataOffset,
  metadataOffset + metadataLength,
);

let decompressed;
if (internalCompression === 2) {
  decompressed = zlib.gunzipSync(metadataBuffer);
} else if (internalCompression === 1) {
  decompressed = metadataBuffer;
} else {
  console.log(`Unsupported compression: ${internalCompression}`);
  process.exit(1);
}

const metadata = JSON.parse(decompressed.toString('utf-8'));
console.log('\nMetadata:');
console.log(JSON.stringify(metadata, null, 2));

// Check for custom fields
console.log('\n--- Custom Fields Check ---');
console.log('tsnMetaVersion:', metadata.tsnMetaVersion);
console.log('tsnGame:', metadata.tsnGame);
console.log('tsnBounds:', metadata.tsnBounds);
console.log('tsnAxis:', metadata.tsnAxis);
console.log('tsnProjection:', metadata.tsnProjection);
