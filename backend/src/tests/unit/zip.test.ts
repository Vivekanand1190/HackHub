describe('Unit Test: ZIP Archive Generation', () => {
  function createSimpleZip(files: Array<{ name: string; content: string }>): Buffer {
    const buffers: Buffer[] = [];
    const centralDirectory: Buffer[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBuf = Buffer.from(file.name, 'utf-8');
      const contentBuf = Buffer.from(file.content, 'utf-8');

      const localHeader = Buffer.alloc(30);
      localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
      localHeader.writeUInt16LE(20, 4); // Version needed
      localHeader.writeUInt16LE(0, 6); // Flags
      localHeader.writeUInt16LE(0, 8); // Compression method (0 = store)
      localHeader.writeUInt16LE(0, 10); // Time
      localHeader.writeUInt16LE(0, 12); // Date
      localHeader.writeUInt32LE(0, 14); // CRC32 (dummy 0 for test)
      localHeader.writeUInt32LE(contentBuf.length, 18); // Compressed size
      localHeader.writeUInt32LE(contentBuf.length, 22); // Uncompressed size
      localHeader.writeUInt16LE(nameBuf.length, 26);
      localHeader.writeUInt16LE(0, 28);

      buffers.push(localHeader, nameBuf, contentBuf);

      const cdHeader = Buffer.alloc(46);
      cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory signature
      cdHeader.writeUInt16LE(20, 4);
      cdHeader.writeUInt16LE(20, 6);
      cdHeader.writeUInt16LE(0, 8);
      cdHeader.writeUInt16LE(0, 10);
      cdHeader.writeUInt16LE(0, 12);
      cdHeader.writeUInt16LE(0, 14);
      cdHeader.writeUInt32LE(0, 16);
      cdHeader.writeUInt32LE(contentBuf.length, 20);
      cdHeader.writeUInt32LE(contentBuf.length, 24);
      cdHeader.writeUInt16LE(nameBuf.length, 28);
      cdHeader.writeUInt16LE(0, 30);
      cdHeader.writeUInt16LE(0, 32);
      cdHeader.writeUInt16LE(0, 34);
      cdHeader.writeUInt16LE(0, 36);
      cdHeader.writeUInt32LE(0, 38);
      cdHeader.writeUInt32LE(offset, 42);

      centralDirectory.push(cdHeader, nameBuf);
      offset += localHeader.length + nameBuf.length + contentBuf.length;
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const b of centralDirectory) cdSize += b.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdOffset, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...buffers, ...centralDirectory, eocd]);
  }

  it('should generate a buffer starting with ZIP magic header bytes PK\\x03\\x04', () => {
    const zipBuf = createSimpleZip([
      { name: 'main.js', content: 'console.log("hello world");' }
    ]);

    expect(zipBuf).toBeInstanceOf(Buffer);
    expect(zipBuf.length).toBeGreaterThan(30);
    expect(zipBuf[0]).toBe(0x50); // 'P'
    expect(zipBuf[1]).toBe(0x4b); // 'K'
    expect(zipBuf[2]).toBe(0x03);
    expect(zipBuf[3]).toBe(0x04);
  });
});
