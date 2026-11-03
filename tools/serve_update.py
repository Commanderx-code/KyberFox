"""Loopback update server for tools/smoke_update.ps1.

Serves the files in --dir. A request for any path ending in /update.xml gets
the dir's update.xml, whatever the channel and build target in the path were,
and every request line is printed so the smoke can record how the updater
expanded %CHANNEL% and %BUILD_TARGET%.
"""
import argparse
import functools
import http.server
import sys
from pathlib import Path


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if path.split("?")[0].endswith("/update.xml"):
            return str(Path(self.directory) / "update.xml")
        return super().translate_path(path)

    def log_message(self, fmt, *args):
        print("REQUEST", self.path, "->", fmt % args, flush=True)


def make_server(directory: Path, port: int) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(Handler, directory=str(directory))
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--dir", required=True, type=Path)
    p.add_argument("--port", type=int, default=8123)
    args = p.parse_args(argv)
    server = make_server(args.dir, args.port)
    print(f"serving {args.dir} on 127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main())
