#!/usr/bin/env python3
"""Generate simple PNG icons for hime extension without external dependencies."""

import struct
import zlib
from pathlib import Path

# hime brand color: #4A90D9 (74, 144, 217)
BRAND_BLUE = (74, 144, 217)
WHITE = (255, 255, 255)

def create_png(width: int, height: int, color: tuple) -> bytes:
    """Create a simple PNG with solid color."""
    
    def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)
    
    # PNG signature
    signature = b'\x89PNG\r\n\x1a\n'
    
    # IHDR chunk
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    ihdr = png_chunk(b'IHDR', ihdr_data)
    
    # Create pixel data (RGB, no alpha for simplicity)
    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # Filter byte
        for x in range(width):
            raw_data += bytes(color)
    
    # Compress pixel data
    compressed = zlib.compress(raw_data)
    idat = png_chunk(b'IDAT', compressed)
    
    # IEND chunk
    iend = png_chunk(b'IEND', b'')
    
    return signature + ihdr + idat + iend

def main():
    icons_dir = Path(__file__).parent / "src" / "icons"
    
    sizes = [16, 48, 128]
    
    for size in sizes:
        png_data = create_png(size, size, BRAND_BLUE)
        output = icons_dir / f"icon{size}.png"
        with open(output, 'wb') as f:
            f.write(png_data)
        print(f"Generated: {output}")
    
    print("\n✅ All icons generated (solid brand blue)")
    print("   For better icons with the 'ひ' character, install Pillow or use rsvg-convert")

if __name__ == "__main__":
    main()
