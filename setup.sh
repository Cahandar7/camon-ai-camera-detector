#!/usr/bin/env bash
# One-time setup: Python venv + AI model + frontend packages.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Backend: Python environment"
cd backend
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null; then
    uv venv .venv --python 3.12
  else
    PY=$(command -v python3.12 || command -v python3.13 || command -v python3)
    "$PY" -m venv .venv
  fi
fi
if command -v uv >/dev/null; then
  PIP=(uv pip install --python .venv/bin/python)
else
  PIP=(.venv/bin/python -m pip install)
fi
# CPU-only PyTorch: skips ~3 GB of CUDA libraries we don't need for OpenVINO
"${PIP[@]}" --index-url https://download.pytorch.org/whl/cpu torch torchvision
"${PIP[@]}" -r requirements.txt

echo "==> Backend: downloading and optimizing the AI model (one-time, ~1-2 min)"
.venv/bin/python -c "from app.detector import prepare_model; prepare_model()"
cd ..

echo "==> Frontend: npm packages"
cd frontend
npm install
cd ..

echo
echo "Done. Start CamOn with:  ./start.sh"
