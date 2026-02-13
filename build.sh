#!/bin/bash
# Build and package hime extension for distribution

set -e

echo "=== Building hime Chrome Extension ==="

# Check for icons
if [ ! -f "src/icons/icon16.png" ]; then
    echo "⚠️  PNG icons not found. Generating..."
    python3 build-icons.py || {
        echo "❌ Failed to generate icons. Please install Python with Pillow, or librsvg-bin/inkscape."
        exit 1
    }
fi

# Clean and build
echo "→ Cleaning previous build..."
rm -rf dist

echo "→ Installing dependencies..."
npm install

echo "→ Building TypeScript..."
npm run build

echo "→ Copying assets..."
npm run copy-assets

# Create package
echo "→ Creating package..."
cd dist
zip -r ../hime-v1.0.0.zip *
cd ..

echo ""
echo "✅ Build complete!"
echo "📦 Package: hime-v1.0.0.zip"
echo ""
echo "Next steps:"
echo "  1. Load 'dist/' folder as unpacked extension to test"
echo "  2. Or upload 'hime-v1.0.0.zip' to Chrome Web Store"
echo ""
