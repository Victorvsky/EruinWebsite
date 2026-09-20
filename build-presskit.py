"""Rebuild the curated press download: python build-presskit.py.

Edit presskit/index.html and presskit/fact-sheet.txt together when facts change.
Only the explicitly listed public media belong in this archive.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
FILES = {
    "fact-sheet.txt": "presskit/fact-sheet.txt",
    "branding/eruin-logo.png": "eruin-logo.png",
    "branding/eruin-key-art.png": "presskit/assets/eruin-key-art.png",
    "screenshots/eruin-traveler.webp": "alder.webp",
    "screenshots/eruin-witch.webp": "morrin-cauldron.webp",
    "screenshots/eruin-old-tree.webp": "tree-face.webp",
    "screenshots/eruin-wisp.webp": "wake-wisp.webp",
    "screenshots/eruin-lantern-towers.webp": "towers.webp",
    "screenshots/eruin-text-conversation.webp": "textTalk.webp",
}

if __name__ == "__main__":
    for source in FILES.values():
        if not (ROOT / source).is_file():
            raise FileNotFoundError(source)
    output = ROOT / "presskit/eruin-press-kit.zip"
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, source in FILES.items():
            archive.write(ROOT / source, name)
    with ZipFile(output) as archive:
        assert archive.testzip() is None, "Archive failed CRC validation"
    print(f"Built {output.relative_to(ROOT)}: {len(FILES)} files, {output.stat().st_size:,} bytes")
