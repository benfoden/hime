#!/usr/bin/env python3
"""Generate PNG icons from SVG for the hime Chrome extension."""

import subprocess
import sys
from pathlib import Path

SVG_FILE = Path("src/icons/icon.svg")
SIZES = [16, 48, 128]

def generate_with_rsvg():
    """Use rsvg-convert if available."""
    for size in SIZES:
        output = SVG_FILE.parent / f"icon{size}.png"
        subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size), str(SVG_FILE)],
            stdout=open(output, "wb"),
            check=True
        )
        print(f"Generated: {output}")

def generate_with_inkscape():
    """Use Inkscape if available."""
    for size in SIZES:
        output = SVG_FILE.parent / f"icon{size}.png"
        subprocess.run(
            [
                "inkscape",
                "--export-type=png",
                f"--export-filename={output}",
                f"--export-width={size}",
                f"--export-height={size}",
                str(SVG_FILE)
            ],
            check=True
        )
        print(f"Generated: {output}")

def generate_with_pillow():
    """Use Pillow to create simple colored icon as fallback."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow not installed. Install with: pip install Pillow")
        sys.exit(1)
    
    for size in SIZES:
        # Create a blue square with "ひ" text
        img = Image.new('RGBA', (size, size), (74, 144, 217, 255))
        draw = ImageDraw.Draw(img)
        
        # Draw white rounded corners effect
        padding = size // 8
        
        # Try to add text if we have a font
        try:
            font_size = int(size * 0.6)
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", font_size)
            text = "ひ"
            bbox = draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            x = (size - text_width) // 2
            y = (size - text_height) // 2 - bbox[1]
            draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)
        except Exception:
            # Fallback: just a colored square
            pass
        
        output = SVG_FILE.parent / f"icon{size}.png"
        img.save(output)
        print(f"Generated: {output} (Pillow fallback)")

def main():
    import shutil
    
    if not SVG_FILE.exists():
        print(f"Error: {SVG_FILE} not found")
        sys.exit(1)
    
    # Try tools in order of preference
    if shutil.which("rsvg-convert"):
        print("Using rsvg-convert...")
        generate_with_rsvg()
    elif shutil.which("inkscape"):
        print("Using Inkscape...")
        generate_with_inkscape()
    else:
        print("Using Pillow fallback...")
        generate_with_pillow()
    
    print("\nAll icons generated successfully!")

if __name__ == "__main__":
    main()
