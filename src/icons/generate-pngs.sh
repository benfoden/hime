#!/bin/bash
cd "$(dirname "$0")"

SVG="icon.svg"

if command -v rsvg-convert &> /dev/null; then
    echo "Using rsvg-convert..."
    rsvg-convert -w 16 -h 16 "$SVG" > icon16.png
    rsvg-convert -w 48 -h 48 "$SVG" > icon48.png
    rsvg-convert -w 128 -h 128 "$SVG" > icon128.png
elif command -v convert &> /dev/null; then
    echo "Using ImageMagick..."
    convert -background none -resize 16x16 "$SVG" icon16.png
    convert -background none -resize 48x48 "$SVG" icon48.png
    convert -background none -resize 128x128 "$SVG" icon128.png
else
    echo "No SVG converter found. Creating placeholder info..."
    echo "Install librsvg-bin or ImageMagick:"
    echo "  sudo apt install librsvg-bin  # or"
    echo "  sudo apt install imagemagick"
    exit 1
fi

echo "Done: icon16.png, icon48.png, icon128.png"
