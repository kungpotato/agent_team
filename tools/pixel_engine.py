#!/usr/bin/env python3
"""
Pixel Art Asset Generator using Pyxel (MIT) & Pillow
Generates authentic 8-bit characters, furniture, and animation frames.
"""

import os
import sys
import json
import pyxel
from PIL import Image as PILImage

OUTPUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public/assets/raw'))
GIFS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public/assets/gifs'))
PYXRES_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public/assets/office.pyxres'))

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(GIFS_DIR, exist_ok=True)

# Pyxel 16-color Retro Palette:
# 0: Black, 1: Dark Blue, 2: Dark Purple, 3: Dark Green, 4: Brown, 5: Dark Gray,
# 6: Light Gray, 7: White, 8: Red, 9: Orange, 10: Yellow, 11: Green, 12: Cyan,
# 13: Light Blue/Indigo, 14: Pink, 15: Peach/Skin

PALETTES = [
    {"name": "cyan",   "shirt": 12, "hair": 0, "skin": 15, "pants": 1},
    {"name": "green",  "shirt": 11, "hair": 8, "skin": 15, "pants": 3},
    {"name": "orange", "shirt": 9,  "hair": 5, "skin": 15, "pants": 2},
    {"name": "purple", "shirt": 2,  "hair": 10,"skin": 15, "pants": 0},
    {"name": "pink",   "shirt": 14, "hair": 12,"skin": 15, "pants": 5},
    {"name": "blue",   "shirt": 1,  "hair": 4, "skin": 15, "pants": 6},
    {"name": "yellow", "shirt": 10, "hair": 3, "skin": 15, "pants": 1},
    {"name": "white",  "shirt": 7,  "hair": 5, "skin": 15, "pants": 11},
]

def draw_character_frame(img, state, frame, pal):
    """Draw a 16x16 8-bit character in a given state and animation frame."""
    img.cls(0) # 0 is transparent / black in export

    shirt = pal["shirt"]
    hair = pal["hair"]
    skin = pal["skin"]
    pants = pal["pants"]

    bob = 0
    if state == "working":
        bob = 0  # Body is completely still, only hands type!
    elif state == "sleeping":
        bob = 1 if frame in (1, 2) else 0
    elif state == "talking":
        bob = -1 if frame % 2 == 1 else 0

    # Pants (Legs seated)
    img.rect(5, 12 + bob, 6, 3, pants)

    # Torso (Shirt)
    img.rect(4, 7 + bob, 8, 5, shirt)
    # Buttons / Collar
    img.pset(7, 8 + bob, 7)
    img.pset(7, 10 + bob, 7)

    # Head (Face)
    img.rect(5, 2 + bob, 6, 5, skin)

    # Hair
    img.rect(4, 1 + bob, 8, 2, hair)
    img.pset(4, 3 + bob, hair)
    img.pset(11, 3 + bob, hair)

    if state == "working":
        # Focused Eyes (glasses reflection)
        img.pset(6, 4 + bob, 12)
        img.pset(9, 4 + bob, 12)
        # Typing arms
        left_tap = 1 if frame % 2 == 0 else 0
        right_tap = 1 if frame % 2 == 1 else 0
        # Hands tapping on keyboard
        img.rect(3, 9 + bob, 2, 3, shirt)
        img.rect(11, 9 + bob, 2, 3, shirt)
        img.pset(5 - left_tap, 11 + bob, skin)
        img.pset(10 + right_tap, 11 + bob, skin)

    elif state == "sleeping":
        # Closed eyes (_ _)
        img.pset(6, 4 + bob, 0)
        img.pset(7, 4 + bob, 0)
        img.pset(9, 4 + bob, 0)
        img.pset(10, 4 + bob, 0)
        # Resting arms
        img.rect(3, 8 + bob, 2, 4, shirt)
        img.rect(11, 8 + bob, 2, 4, shirt)
        img.rect(5, 11 + bob, 2, 1, skin)
        img.rect(9, 11 + bob, 2, 1, skin)

        # Zzz floating
        if frame == 1:
            img.pset(12, 2, 10) # z
        elif frame == 2:
            img.rect(12, 1, 2, 2, 10) # Z
        elif frame == 3:
            img.rect(13, 0, 3, 3, 12) # Z

    elif state == "talking":
        # Open eyes
        img.pset(6, 4 + bob, 0)
        img.pset(9, 4 + bob, 0)
        # Animated mouth (opening / closing)
        if frame % 2 == 1:
            img.rect(7, 6 + bob, 2, 1, 8) # Open mouth (red)
        else:
            img.pset(7, 6 + bob, 4) # Closed mouth

        # Gesturing hand
        if frame % 2 == 1:
            img.rect(3, 8 + bob, 2, 4, shirt)
            img.rect(11, 6 + bob, 2, 4, shirt) # Hand raised
            img.rect(11, 5 + bob, 2, 2, skin)
        else:
            img.rect(3, 8 + bob, 2, 4, shirt)
            img.rect(11, 8 + bob, 2, 4, shirt)

def draw_furniture(img, item_name):
    """Draw 8-bit furniture and props."""
    img.cls(0)
    if item_name == "laptop":
        # Base
        img.rect(2, 10, 12, 3, 5) # Dark gray base
        img.rect(3, 11, 10, 1, 0) # Keyboard
        # Screen
        img.rect(3, 3, 10, 7, 6)  # Outer bezel
        img.rect(4, 4, 8, 5, 1)   # Blue display
        # Code lines
        img.rect(5, 5, 4, 1, 11)  # Green syntax line
        img.rect(5, 7, 5, 1, 12)  # Cyan syntax line
    elif item_name == "chair":
        # Backrest
        img.rect(4, 1, 8, 8, 5)
        img.rect(5, 2, 6, 6, 1)
        # Cushion
        img.rect(3, 9, 10, 3, 5)
        # Pole & Wheels
        img.rect(7, 12, 2, 2, 6)
        img.rect(4, 14, 8, 1, 0)
    elif item_name == "coffee_mug":
        img.rect(5, 7, 6, 7, 7) # White cup
        img.rect(11, 9, 2, 3, 7) # Handle
        img.rect(6, 8, 4, 2, 4) # Coffee
        # Steam
        img.pset(7, 4, 6)
        img.pset(8, 2, 7)

def main():
    print("🎨 Generating 8-bit pixel art assets using Pyxel & Pillow...")

    generated_files = []

    # 1. Generate Character Animation Frames for each palette & state
    states = ["working", "sleeping", "talking"]
    num_frames = 4

    for pal in PALETTES:
        pal_name = pal["name"]
        for state in states:
            for f in range(num_frames):
                img = pyxel.Image(16, 16)
                draw_character_frame(img, state, f, pal)
                filename = f"char_{pal_name}_{state}_{f}.png"
                filepath = os.path.join(OUTPUT_DIR, filename)
                img.save(filepath, 4) # Scale 4x (64x64)
                generated_files.append(filepath)

    # 2. Generate Furniture & Props
    furniture_items = ["laptop", "chair", "coffee_mug"]
    for item in furniture_items:
        img = pyxel.Image(16, 16)
        draw_furniture(img, item)
        filename = f"prop_{item}.png"
        filepath = os.path.join(OUTPUT_DIR, filename)
        img.save(filepath, 4)
        generated_files.append(filepath)

    print(f"✨ Successfully generated {len(generated_files)} pixel art frames in {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
