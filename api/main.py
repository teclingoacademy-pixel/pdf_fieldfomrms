from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List
import subprocess
import tempfile
import os
import uuid
import pymupdf

app = FastAPI()

SESSIONS = {}
TEMP_DIR = tempfile.mkdtemp(prefix="formulario_")

class FieldUpdate(BaseModel):
    name: str
    rect: list
    max_len: int = 0
    font_size: int = 10
    align: str = "left"
    type_input: str = "text"

class SessionUpdate(BaseModel):
    updates: List[FieldUpdate]

@app.post("/api/process")
async def process_pdf(file: UploadFile = File(...)):
    session_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"{session_id}_input.pdf")
    output_path = os.path.join(TEMP_DIR, f"{session_id}_fillable.pdf")
    
    with open(input_path, "wb") as f:
        f.write(await file.read())
    
    result = subprocess.run(
        ["commonforms", "--model", "FFDNet-S", input_path, output_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=result.stderr)
    
    doc = pymupdf.open(output_path)
    fields = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        for widget in page.widgets():
            fields.append({
                "page": page_num,
                "name": widget.field_name,
                "type": widget.field_type_string,
                "rect": list(widget.rect),
                "max_len": getattr(widget, 'text_maxlen', 0) or 0,
                "value": widget.field_value or ""
            })
    doc.close()
    
    SESSIONS[session_id] = {"input": input_path, "output": output_path, "fields": fields}
    return {"session_id": session_id, "fields": fields, "pdf_url": f"/api/session/{session_id}/pdf"}

@app.get("/api/session/{session_id}/pdf")
async def get_session_pdf(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    return FileResponse(SESSIONS[session_id]["output"], media_type="application/pdf")

@app.post("/api/session/{session_id}/update")
async def update_fields(session_id: str, data: SessionUpdate):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    
    output_path = SESSIONS[session_id]["output"]
    doc = pymupdf.open(output_path)
    updates = {u.name: u for u in data.updates}
    
    align_map = {"left": 0, "center": 1, "right": 2}
    
    for page in doc:
        for widget in page.widgets():
            if widget.field_name in updates:
                u = updates[widget.field_name]
                r = u.rect
                widget.rect = pymupdf.Rect(r[0], r[1], r[2], r[3])
                
                if u.font_size:
                    widget.text_fontsize = u.font_size
                
                if u.align in align_map:
                    widget.text_align = align_map[u.align]
                
                if u.max_len > 0:
                    widget.text_maxlen = u.max_len
                    widget.field_flags |= pymupdf.PDF_TX_FIELD_IS_COMB
                    auto_font = (r[2] - r[0]) / (u.max_len * 5.5)
                    if not u.font_size:
                        widget.text_fontsize = max(6, min(14, auto_font))
                else:
                    widget.text_maxlen = 0
                    widget.field_flags &= ~pymupdf.PDF_TX_FIELD_IS_COMB
                
                widget.update()
    
    tmp_path = output_path + ".tmp"
    doc.save(tmp_path)
    doc.close()
    os.replace(tmp_path, output_path)
    return {"status": "ok", "updated": len(updates)}

@app.get("/api/session/{session_id}/download")
async def download_pdf(session_id: str):
    if session_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Sesion no encontrada")
    return FileResponse(
        SESSIONS[session_id]["output"],
        media_type="application/pdf",
        filename="formulario_ajustado.pdf"
    )

# NO ponemos app.mount aqui porque el frontend esta en Vercel
