#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DIR/.." && pwd)"
RAW_DIR="$ROOT_DIR/public/assets/raw"
GIFS_DIR="$ROOT_DIR/public/assets/gifs"
ASSETS_DIR="$ROOT_DIR/public/assets"

echo "🧙 Running ImageMagick CLI Pipeline..."

if ! command -v magick &> /dev/null; then
  echo "❌ Error: ImageMagick (magick) is not installed."
  exit 1
fi

mkdir -p "$GIFS_DIR"

PALETTES=("cyan" "green" "orange" "purple" "pink" "blue" "yellow" "white")
STATES=("working" "sleeping" "talking")

# 1. Generate Animated GIFs for all palettes & states
echo "🎞️  Generating Animated GIFs with ImageMagick..."
for pal in "${PALETTES[@]}"; do
  for state in "${STATES[@]}"; do
    files=("$RAW_DIR"/char_"${pal}"_"${state}"_*.png)
    if [ -f "${files[0]}" ]; then
      out_gif="$GIFS_DIR/${pal}_${state}.gif"
      # -delay 18 (~180ms per frame), transparent background preservation
      magick -delay 18 -dispose previous "${files[@]}" -loop 0 "$out_gif"
    fi
  done
done

# 2. Assemble Master Spritesheet using ImageMagick +append / -append
echo "🖼️  Assembling Master Spritesheet with ImageMagick..."
# Row 1: Working (4 frames)
magick "$RAW_DIR"/char_cyan_working_*.png +append "$ASSETS_DIR/_row_working.png"
# Row 2: Sleeping (4 frames)
magick "$RAW_DIR"/char_cyan_sleeping_*.png +append "$ASSETS_DIR/_row_sleeping.png"
# Row 3: Talking (4 frames)
magick "$RAW_DIR"/char_cyan_talking_*.png +append "$ASSETS_DIR/_row_talking.png"
# Row 4: Props
magick "$RAW_DIR"/prop_*.png +append "$ASSETS_DIR/_row_props.png"

# Combine rows vertically
magick \
  "$ASSETS_DIR/_row_working.png" \
  "$ASSETS_DIR/_row_sleeping.png" \
  "$ASSETS_DIR/_row_talking.png" \
  "$ASSETS_DIR/_row_props.png" \
  -background none -append "$ASSETS_DIR/spritesheet.png"

rm -f "$ASSETS_DIR"/_row_*.png

# 3. Generate LibreSprite / Aseprite Compatible JSON Metadata
echo "📄 Generating LibreSprite / Aseprite JSON metadata..."
node -e '
const fs = require("fs");
const path = require("path");

const metadata = {
  meta: {
    app: "Agent Team Pixel Engine (Pyxel + ImageMagick)",
    version: "1.0.0",
    format: "RGBA8888",
    image: "spritesheet.png",
    size: { w: 256, h: 256 },
    scale: "1",
    frameTags: [
      { name: "working", from: 0, to: 3, direction: "forward" },
      { name: "sleeping", from: 4, to: 7, direction: "forward" },
      { name: "talking", from: 8, to: 11, direction: "forward" },
      { name: "props", from: 12, to: 14, direction: "forward" }
    ]
  },
  frames: {
    "working_0": { frame: { x: 0, y: 0, w: 64, h: 64 }, duration: 180 },
    "working_1": { frame: { x: 64, y: 0, w: 64, h: 64 }, duration: 180 },
    "working_2": { frame: { x: 128, y: 0, w: 64, h: 64 }, duration: 180 },
    "working_3": { frame: { x: 192, y: 0, w: 64, h: 64 }, duration: 180 },

    "sleeping_0": { frame: { x: 0, y: 64, w: 64, h: 64 }, duration: 180 },
    "sleeping_1": { frame: { x: 64, y: 64, w: 64, h: 64 }, duration: 180 },
    "sleeping_2": { frame: { x: 128, y: 64, w: 64, h: 64 }, duration: 180 },
    "sleeping_3": { frame: { x: 192, y: 64, w: 64, h: 64 }, duration: 180 },

    "talking_0": { frame: { x: 0, y: 128, w: 64, h: 64 }, duration: 180 },
    "talking_1": { frame: { x: 64, y: 128, w: 64, h: 64 }, duration: 180 },
    "talking_2": { frame: { x: 128, y: 128, w: 64, h: 64 }, duration: 180 },
    "talking_3": { frame: { x: 192, y: 128, w: 64, h: 64 }, duration: 180 },

    "prop_chair": { frame: { x: 0, y: 192, w: 64, h: 64 }, duration: 0 },
    "prop_laptop": { frame: { x: 64, y: 192, w: 64, h: 64 }, duration: 0 },
    "prop_coffee": { frame: { x: 128, y: 192, w: 64, h: 64 }, duration: 0 }
  }
};

fs.writeFileSync(
  path.join(process.argv[1], "spritesheet.json"),
  JSON.stringify(metadata, null, 2)
);
' "$ASSETS_DIR"

echo "✅ ImageMagick Pipeline completed successfully!"
echo "📁 Generated assets:"
ls -lh "$ASSETS_DIR/spritesheet.png" "$ASSETS_DIR/spritesheet.json"
echo "📁 Generated GIFs sample:"
ls -lh "$GIFS_DIR" | head -n 8
