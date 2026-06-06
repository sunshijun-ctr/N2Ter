"""WeasyPrint native-library bootstrap (Windows / conda friendly).

WeasyPrint needs GTK native libraries (gobject / pango / harfbuzz / fontconfig /
pangoft2). On a conda environment these ship as ``<name>.dll`` under
``<env>/Library/bin`` but WeasyPrint looks for the ``lib``-prefixed names, so it
fails out of the box on Windows.

This module, when imported before WeasyPrint, transparently fixes that without
any privileges or file changes:

* adds ``<env>/Library/bin`` to the DLL search path;
* points ``FONTCONFIG_PATH`` at the conda fontconfig config so Pango can build a
  font map;
* maps WeasyPrint's ``lib*`` library names onto the real conda filenames via a
  ``cffi`` shim, so WeasyPrint and Pango load the *same* physical DLL (avoiding
  duplicate GObject type registries).

It is a no-op on platforms / installs where the conda libs are not present, so
standard Linux installs keep working unchanged.
"""

import os
import sys
from pathlib import Path

# WeasyPrint's first-choice library name -> conda filename under Library/bin.
_LIB_NAME_MAP = {
    "libgobject-2.0-0": "gobject-2.0-0.dll",
    "libpango-1.0-0": "pango-1.0-0.dll",
    "libpangocairo-1.0-0": "pangocairo-1.0-0.dll",
    "libharfbuzz-0": "harfbuzz.dll",
    "libharfbuzz-subset-0": "harfbuzz-subset.dll",
    "libfontconfig-1": "fontconfig-1.dll",
    "libpangoft2-1.0-0": "pangoft2-1.0-0.dll",
}

_configured = False


def _conda_library_bin() -> Path | None:
    library_bin = Path(sys.executable).resolve().parent / "Library" / "bin"
    if (library_bin / "gobject-2.0-0.dll").exists():
        return library_bin
    return None


def configure() -> None:
    """Idempotently set up the WeasyPrint native-library environment."""
    global _configured
    if _configured or os.name != "nt":
        _configured = True
        return
    _configured = True

    library_bin = _conda_library_bin()
    if library_bin is None:
        return  # Not a conda Windows env; assume libs are on PATH already.

    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(str(library_bin))
        except OSError:
            pass

    fonts_dir = library_bin.parent / "etc" / "fonts"
    if fonts_dir.exists():
        os.environ.setdefault("FONTCONFIG_PATH", str(fonts_dir))

    try:
        import cffi
    except ImportError:
        return

    available = {
        name: filename
        for name, filename in _LIB_NAME_MAP.items()
        if (library_bin / filename).exists()
    }
    if not available or getattr(cffi.FFI, "_n2ter_patched", False):
        return

    original_dlopen = cffi.FFI.dlopen

    def _patched_dlopen(self, name, *args, **kwargs):
        return original_dlopen(self, available.get(name, name), *args, **kwargs)

    cffi.FFI.dlopen = _patched_dlopen
    cffi.FFI._n2ter_patched = True
