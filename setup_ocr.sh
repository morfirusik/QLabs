#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v tesseract >/dev/null || { echo 'Установите Tesseract OCR и повторите запуск.' >&2; exit 1; }
mkdir -p data/tessdata
for entry in \
  'eng 7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2' \
  'rus e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225' \
  'kaz fcc01eed3815a42b9c6321c4c9d3606f39b166cbf95ade98b7d8d12063eae53d'; do
  read -r lang expected <<< "$entry"
  target="data/tessdata/$lang.traineddata"
  if [ -f "$target" ] && [ "$(sha256sum "$target" | cut -d' ' -f1)" = "$expected" ]; then continue; fi
  curl -fLsS --max-time 60 "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/$lang.traineddata" -o "$target"
  printf '%s  %s\n' "$expected" "$target" | sha256sum -c -
done
TESSDATA_PREFIX="$(pwd)/data/tessdata" tesseract --list-langs
