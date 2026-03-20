import fs from 'fs';

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node check-pmtiles-header.js <pmtiles-file>');
  process.exit(1);
}

const buffer = fs.readFileSync(filePath);

// Check magic number
const magic = buffer.subarray(0, 7).toString('ascii');
console.log('Magic:', magic, magic === 'PMTiles' ? '✓' : '✗');

// Check version
const version = buffer.readUInt8(7);
console.log('Version:', version);

// Read all offsets and lengths
const rootDirOffset = Number(buffer.readBigUInt64LE(8));
const rootDirLength = Number(buffer.readBigUInt64LE(16));
const metadataOffset = Number(buffer.readBigUInt64LE(24));
const metadataLength = Number(buffer.readBigUInt64LE(32));
const leafDirOffset = Number(buffer.readBigUInt64LE(40));
const leafDirLength = Number(buffer.readBigUInt64LE(48));
const tileDataOffset = Number(buffer.readBigUInt64LE(56));
const tileDataLength = Number(buffer.readBigUInt64LE(64));

console.log('\nHeader structure:');
console.log('Root directory: offset =', rootDirOffset, ', length =', rootDirLength);
console.log('Metadata:       offset =', metadataOffset, ', length =', metadataLength);
console.log('Leaf directory: offset =', leafDirOffset, ', length =', leafDirLength);
console.log('Tile data:      offset =', tileDataOffset, ', length =', tileDataLength);

// Check if offsets are in correct order
console.log('\nOffset order check:');
const offsets = [
  { name: 'Header', offset: 0, length: 127 },
  { name: 'Metadata', offset: metadataOffset, length: metadataLength },
  { name: 'Root directory', offset: rootDirOffset, length: rootDirLength },
  { name: 'Leaf directory', offset: leafDirOffset, length: leafDirLength },
  { name: 'Tile data', offset: tileDataOffset, length: tileDataLength },
].filter(x => x.offset > 0).sort((a, b) => a.offset - b.offset);

let valid = true;
for (let i = 0; i < offsets.length; i++) {
  const curr = offsets[i];
  const end = curr.offset + curr.length;
  console.log(`${curr.name}: ${curr.offset} - ${end}`);

  if (i < offsets.length - 1) {
    const next = offsets[i + 1];
    if (end > next.offset) {
      console.log(`  ✗ OVERLAP with ${next.name}!`);
      valid = false;
    } else {
      console.log(`  ✓ OK`);
    }
  }
}

console.log('\nFile size:', buffer.length);
console.log('Expected minimum size:', Math.max(...offsets.map(x => x.offset + x.length)));
console.log('Structure valid:', valid ? '✓' : '✗');
