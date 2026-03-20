import fs from 'fs';
import { PMTiles } from 'pmtiles';

const filePath = process.argv[2] || 'output/ets2.pmtiles';

class FileSource {
  constructor(path) {
    this.path = path;
    this.fd = fs.openSync(path, 'r');
  }

  getKey() {
    return this.path;
  }

  async getBytes(offset, length) {
    const buffer = Buffer.allocUnsafe(length);
    fs.readSync(this.fd, buffer, 0, length, offset);
    return { data: buffer.buffer };
  }
}

async function main() {
  const source = new FileSource(filePath);
  const pmtiles = new PMTiles(source);

  const header = await pmtiles.getHeader();
  const metadata = await pmtiles.getMetadata();

  console.log('=== PMTiles Header ===');
  console.log(JSON.stringify(header, null, 2));
  console.log('\n=== PMTiles Metadata ===');
  console.log(JSON.stringify(metadata, null, 2));
}

main().catch(console.error);
