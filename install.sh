#!/bin/sh
# Installs clipode: downloads this platform's binary from GitHub releases, checks it against SHA256SUMS,
# and puts it in ~/.local/bin (or $CLIPODE_INSTALL_DIR).
# Usage: curl -fsSL https://raw.githubusercontent.com/jumpingmushroom/clipode/main/install.sh | sh
#        CLIPODE_VERSION=0.1.0 sh install.sh
#        CLIPODE_BASE_URL=https://mirror.example/clipode sh install.sh   (a directory holding the release files)
set -eu

REPO="jumpingmushroom/clipode"
DIR="${CLIPODE_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) echo "clipode: unsupported system $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) echo "clipode: unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

asset="clipode-$os-$arch.gz"
if [ -n "${CLIPODE_BASE_URL:-}" ]; then
  base="$CLIPODE_BASE_URL"
elif [ -n "${CLIPODE_VERSION:-}" ]; then
  base="https://github.com/$REPO/releases/download/v$CLIPODE_VERSION"
else
  base="https://github.com/$REPO/releases/latest/download"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
echo "Downloading $asset"
curl -fsSL -o "$tmp/$asset" "$base/$asset"
curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS"

expected="$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)"
if command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | cut -d' ' -f1)"
else
  actual="$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)"
fi
if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
  echo "clipode: checksum mismatch for $asset" >&2
  exit 1
fi

mkdir -p "$DIR"
gunzip -c "$tmp/$asset" > "$tmp/clipode"
chmod 755 "$tmp/clipode"
mv "$tmp/clipode" "$DIR/clipode"
echo "Installed clipode $("$DIR/clipode" --version) to $DIR/clipode"
case ":$PATH:" in
  *":$DIR:"*) ;;
  *) echo "Add $DIR to your PATH to run clipode." ;;
esac
