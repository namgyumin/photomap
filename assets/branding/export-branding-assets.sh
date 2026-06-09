#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

rsvg-convert -w 1024 -h 1024 -b '#E9F6F2' app-icon.svg -o app-icon.png
rsvg-convert -w 512 -h 512 logo-mark.svg -o logo-mark.png
rsvg-convert -w 1200 -h 360 logo-horizontal.svg -o logo-horizontal.png
rsvg-convert -w 512 -h 512 adaptive-icon-foreground.svg -o adaptive-icon-foreground.png
rsvg-convert -w 512 -h 512 adaptive-icon-background.svg -o adaptive-icon-background.png
rsvg-convert -w 432 -h 432 adaptive-icon-monochrome.svg -o adaptive-icon-monochrome.png
rsvg-convert -w 48 -h 48 favicon.svg -o favicon.png
rsvg-convert -w 128 -h 128 icon-map-pin-photo.svg -o icon-map-pin-photo.png
rsvg-convert -w 128 -h 128 icon-memory-route.svg -o icon-memory-route.png
