#!/bin/bash
exec 2>/dev/null
set -e

LANGUAGE="$1"
CODE_FILE="$2"
STDIN_FILE="$3"

WORKDIR="/tmp/workspace"
mkdir -p "$WORKDIR"
cp "$CODE_FILE" "$WORKDIR/"
CODE_BASENAME=$(basename "$CODE_FILE")

STDIN_ARG=""
if [ -n "$STDIN_FILE" ] && [ -f "$STDIN_FILE" ]; then
  cp "$STDIN_FILE" "$WORKDIR/"
  STDIN_ARG="$WORKDIR/$(basename "$STDIN_FILE")"
fi

cd "$WORKDIR"

run_cmd() {
  if [ -n "$STDIN_ARG" ]; then
    "$1" < "$STDIN_ARG"
  else
    "$1"
  fi
}

case "$LANGUAGE" in
  javascript)
    if [ -n "$STDIN_ARG" ]; then node "$CODE_BASENAME" < "$STDIN_ARG"; else node "$CODE_BASENAME"; fi
    ;;
  python)
    if [ -n "$STDIN_ARG" ]; then python3 "$CODE_BASENAME" < "$STDIN_ARG"; else python3 "$CODE_BASENAME"; fi
    ;;
  java)
    CLASS_NAME=$(basename "$CODE_BASENAME" .java)
    javac "$CODE_BASENAME" -d "$WORKDIR" 2>&1
    if [ -n "$STDIN_ARG" ]; then java -cp "$WORKDIR" "$CLASS_NAME" < "$STDIN_ARG"; else java -cp "$WORKDIR" "$CLASS_NAME"; fi
    ;;
  cpp)
    OUT_FILE="${CODE_BASENAME}.out"
    g++ "$CODE_BASENAME" -o "$OUT_FILE" -std=c++17 2>&1
    if [ -n "$STDIN_ARG" ]; then ./"$OUT_FILE" < "$STDIN_ARG"; else ./"$OUT_FILE"; fi
    ;;
  c)
    OUT_FILE="${CODE_BASENAME}.out"
    gcc "$CODE_BASENAME" -o "$OUT_FILE" 2>&1
    if [ -n "$STDIN_ARG" ]; then ./"$OUT_FILE" < "$STDIN_ARG"; else ./"$OUT_FILE"; fi
    ;;
  ruby)
    if [ -n "$STDIN_ARG" ]; then ruby "$CODE_BASENAME" < "$STDIN_ARG"; else ruby "$CODE_BASENAME"; fi
    ;;
  go)
    OUT_FILE="${CODE_BASENAME}.out"
    go build -o "$OUT_FILE" "$CODE_BASENAME" 2>&1
    if [ -n "$STDIN_ARG" ]; then ./"$OUT_FILE" < "$STDIN_ARG"; else ./"$OUT_FILE"; fi
    ;;
  *)
    echo "Unsupported language: $LANGUAGE" >&2
    exit 1
    ;;
esac
