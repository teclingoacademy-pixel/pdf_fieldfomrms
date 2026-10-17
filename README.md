# PDF Field Forms Editor

Editor web para agregar campos interactivos a formularios PDF escaneados usando IA.

## Que hace
1. Sube un PDF plano
2. La IA detecta campos automaticamente
3. Editor visual para ajustar cada campo
4. Descarga el PDF con campos funcionales

## Stack
- Backend: FastAPI + PyMuPDF + CommonForms
- Frontend: HTML/CSS/JS + PDF.js

## Instalacion
pip install -r api/requirements.txt
uvicorn api.main:app --reload --port 8000

## Uso
1. Arrastra tu PDF
2. Espera a que la IA detecte los campos
3. Ajusta cada campo
4. Guarda y descarga

## Licencia
MIT
