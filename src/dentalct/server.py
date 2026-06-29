"""Localhost HTTP server: cached volume -> MPR PNG slices, overlays, 3D volume.

Endpoints:
  GET /                       viewer index.html
  GET /api/meta               volume metadata + overlays
  GET /api/slice?plane=&idx=&wc=&ww=&thk=&mode=   PNG slice
  GET /api/volume3d?factor=3  raw int16 downsampled volume (x-dims header)
PHI stays on localhost.
"""
from __future__ import annotations

import io
import json
import struct
import sys
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np

from . import loader, sampler
from .overlays import parse_overlays

VIEWER = Path(__file__).resolve().parents[2] / "viewer"
VOL = None
META = None
OVR = None


def png(gray: np.ndarray) -> bytes:
    rgb = gray.ndim == 3
    h, w = gray.shape[:2]
    raw = b"".join(b"\x00" + gray[r].tobytes() for r in range(h))
    def chunk(t, d):
        c = t + d
        return struct.pack(">I", len(d)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2 if rgb else 0, 0, 0, 0)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 6)) + chunk(b"IEND", b"")


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # quiet
        pass

    def _send(self, body, ctype, headers=None):
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        p = u.path
        if p == "/" or p == "/index.html":
            return self._send((VIEWER / "index.html").read_bytes(), "text/html")
        if p.startswith("/api/meta"):
            d = dict(META); d["overlays"] = OVR
            d["nslices"] = {pl: sampler.n_slices(VOL, pl) for pl in sampler.PLANES}
            return self._send(json.dumps(d).encode(), "application/json")
        if p.startswith("/api/slice"):
            img = sampler.slice_image(VOL, q.get("plane", "axial"), int(q.get("idx", 0)),
                                      float(q.get("wc", META["window_center"])),
                                      float(q.get("ww", META["window_width"])),
                                      int(q.get("thk", 1)), q.get("mode", "avg"))
            return self._send(png(img), "image/png", {"Cache-Control": "no-cache"})
        if p.startswith("/api/panoramic"):
            arch = (OVR or {}).get("arch")
            if not arch:
                return self.send_error(404)
            xy = [[pt[0], pt[1]] for pt in arch]
            img = sampler.panoramic(VOL, xy, float(q.get("wc", META["window_center"])),
                                    float(q.get("ww", META["window_width"])),
                                    int(q.get("thk", 10)))
            return self._send(png(img), "image/png", {"Cache-Control": "no-cache"})
        if p.startswith("/api/crosssec"):
            arch = (OVR or {}).get("arch")
            if not arch:
                return self.send_error(404)
            xy = [[pt[0], pt[1]] for pt in arch]
            img = sampler.cross_section(VOL, xy, float(q.get("wc", META["window_center"])),
                                        float(q.get("ww", META["window_width"])),
                                        float(q.get("pos", 0.5)),
                                        canals=(OVR or {}).get("canals") if q.get("canal") else None)
            return self._send(png(img), "image/png", {"Cache-Control": "no-cache"})
        if p.startswith("/api/oblique"):
            img = sampler.oblique(VOL, float(q.get("wc", META["window_center"])),
                                  float(q.get("ww", META["window_width"])),
                                  float(q.get("az", 0)), float(q.get("el", 0)),
                                  float(q.get("depth", 0)))
            return self._send(png(img), "image/png", {"Cache-Control": "no-cache"})
        if p.startswith("/api/volume3d"):
            f = int(q.get("factor", 3))
            ds = sampler.downsampled(VOL, f)
            hdr = {"X-Dims": ",".join(map(str, ds.shape)), "X-Factor": str(f)}
            return self._send(ds.tobytes(), "application/octet-stream", hdr)
        fp = VIEWER / p.lstrip("/")
        if fp.is_file():
            ct = "text/javascript" if fp.suffix == ".js" else "text/css" if fp.suffix == ".css" else "application/octet-stream"
            return self._send(fp.read_bytes(), ct)
        self.send_error(404)


def main() -> None:
    global VOL, META, OVR
    vd = sys.argv[1] if len(sys.argv) > 1 else "VOL_0"
    VOL, META = loader.load_or_build(vd)
    OVR = parse_overlays(vd)
    print(f"volume {META['shape']} @ {META['spacing_mm']}mm  ->  http://localhost:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()


if __name__ == "__main__":
    main()
