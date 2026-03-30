#!/usr/bin/env python3
"""Generate all icon sizes from icon.svg for electron-builder."""
import subprocess, os, sys

os.chdir(os.path.join(os.path.dirname(__file__), "..", "assets", "icons"))
svg = "icon.svg"

# Render SVG to high-res PNG via qlmanage
subprocess.run(["qlmanage", "-t", "-s", "1024", "-o", "/tmp/", svg], capture_output=True)
src = "/tmp/icon.svg.png"

if not os.path.exists(src):
    print("ERROR: qlmanage failed to render SVG")
    sys.exit(1)

# Main icon PNGs
for name, size in [("icon.png", 512), ("icon@2x.png", 1024)]:
    subprocess.run(["sips", "-z", str(size), str(size), src, "--out", name], capture_output=True)
    print(f"  {name}: {size}x{size}")

# iconset for macOS icns
iconset = "icon.iconset"
os.makedirs(iconset, exist_ok=True)

for name, size in [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]:
    subprocess.run(["sips", "-z", str(size), str(size), src, "--out", os.path.join(iconset, name)], capture_output=True)
    print(f"  {iconset}/{name}: {size}x{size}")

# Build icns
r = subprocess.run(["iconutil", "-c", "icns", iconset], capture_output=True, text=True)
print(f"  icon.icns: {'OK' if r.returncode == 0 else r.stderr.strip()}")

# Build ico for Windows (use sips for base, then png2ico or just copy 256px)
# electron-builder can use a 256x256 PNG as ico source, but let's try png2ico
ico_sizes = [16, 32, 48, 64, 128, 256]
ico_pngs = []
for s in ico_sizes:
    p = f"/tmp/ico_{s}.png"
    subprocess.run(["sips", "-z", str(s), str(s), src, "--out", p], capture_output=True)
    ico_pngs.append(p)

# Try using iconutil alternative for ico, or just keep the PNG for electron-builder
# electron-builder can convert PNG to ICO automatically if icon.ico is missing
# But let's try to create one with python
try:
    from PIL import Image
    img = Image.open(src).convert("RGBA")
    sizes_for_ico = [(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)]
    img.save("icon.ico", format="ICO", sizes=sizes_for_ico)
    print("  icon.ico: OK (via Pillow)")
except ImportError:
    # No Pillow — electron-builder will handle ico from png
    print("  icon.ico: skipped (no Pillow, electron-builder will convert from PNG)")

os.remove(src)
for p in ico_pngs:
    if os.path.exists(p):
        os.remove(p)

print("Done!")
