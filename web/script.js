// Inicializar PDF.js
try {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
} catch (e) { console.error('Error PDF.js:', e); }

// Referencias del DOM
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const processBtn = document.getElementById('processBtn');
const status = document.getElementById('status');
const uploadView = document.getElementById('uploadView');
const editorView = document.getElementById('editorView');
const pdfPages = document.getElementById('pdfPages');
const fieldCounter = document.getElementById('fieldCounter');
const saveBtn = document.getElementById('saveBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const toggleFields = document.getElementById('toggleFields');
const noSelection = document.getElementById('noSelection');
const fieldProperties = document.getElementById('fieldProperties');
const propName = document.getElementById('propName');
const propType = document.getElementById('propType');
const propCells = document.getElementById('propCells');
const propFontSize = document.getElementById('propFontSize');
const propAlign = document.getElementById('propAlign');
const propPosition = document.getElementById('propPosition');
const propSize = document.getElementById('propSize');
const deleteField = document.getElementById('deleteField');

// Estado
let selectedFile = null;
let currentSession = null;
let currentFields = [];
let originalFields = [];
let fieldElements = [];
let showFields = true;
let selectedFieldName = null;
let currentScale = 1;
let pdfDoc = null;
let resizeTimeout = null;

// Manejo del archivo
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) selectFile(e.target.files[0]);
});

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#0071e3';
    uploadArea.style.background = '#f0f7ff';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#d2d2d7';
    uploadArea.style.background = '#fafafa';
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#d2d2d7';
    uploadArea.style.background = '#fafafa';
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') selectFile(file);
});

function selectFile(file) {
    selectedFile = file;
    uploadArea.querySelector('p').textContent = '📎 ' + file.name;
    processBtn.disabled = false;
    status.textContent = 'Archivo listo para procesar';
}

function calculateOptimalScale(page) {
    const pdfContainer = document.querySelector('.pdf-container');
    const containerWidth = pdfContainer.clientWidth - 30;
    const naturalViewport = page.getViewport({ scale: 1 });
    let scale = containerWidth / naturalViewport.width;
    return Math.max(0.5, Math.min(2, scale));
}

processBtn.addEventListener('click', async () => {
    if (!selectedFile) return;
    processBtn.disabled = true;
    processBtn.textContent = 'Procesando...';
    status.textContent = 'Detectando campos con IA... (puede tardar 1-2 minutos)';
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
        const response = await fetch('/api/process', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Error del servidor');
        
        const data = await response.json();
        currentSession = data.session_id;
        currentFields = data.fields.map(f => ({...f, type: f.type || 'text', font_size: 10, align: 'left'}));
        originalFields = JSON.parse(JSON.stringify(currentFields));
        
        pdfDoc = await pdfjsLib.getDocument(data.pdf_url).promise;
        
        uploadView.style.display = 'none';
        editorView.style.display = 'flex';
        
        // Esperar a que el editor sea visible antes de calcular la escala
        await new Promise(r => setTimeout(r, 100));
        await renderPdf();
        
        fieldCounter.textContent = currentFields.length + ' campos detectados';
        noSelection.style.display = 'block';
        fieldProperties.style.display = 'none';
    } catch (error) {
        status.textContent = '❌ Error: ' + error.message;
        processBtn.textContent = 'Reintentar';
        processBtn.disabled = false;
    }
});

async function renderPdf() {
    if (!pdfDoc) return;
    pdfPages.innerHTML = '';
    fieldElements = [];
    
    const firstPage = await pdfDoc.getPage(1);
    currentScale = calculateOptimalScale(firstPage);
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });
        
        const pageDiv = document.createElement('div');
        pageDiv.className = 'pdf-page';
        pageDiv.style.width = viewport.width + 'px';
        pageDiv.style.height = viewport.height + 'px';
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pageDiv.appendChild(canvas);
        pdfPages.appendChild(pageDiv);
        
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        
        const pageFields = currentFields.filter(f => f.page === pageNum - 1);
        pageFields.forEach(field => {
            const el = createFieldElement(field, pageDiv);
            fieldElements.push(el);
        });
    }
}

function createFieldElement(field, pageDiv) {
    const div = document.createElement('div');
    div.className = 'field-rect';
    if (field.type && (field.type.toLowerCase().includes('check') || field.type.toLowerCase().includes('radio'))) {
        div.classList.add('choice');
    } else if (field.type && field.type.toLowerCase().includes('signature')) {
        div.classList.add('signature');
    }
    if (field.max_len > 0) div.classList.add('comb');
    
    updateFieldElementPosition(div, field);
    
    div.dataset.fieldName = field.name;
    div.dataset.pageNum = field.page;
    
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        selectField(field.name);
    });
    
    makeDraggable(div, field);
    pageDiv.appendChild(div);
    return div;
}

function updateFieldElementPosition(el, field) {
    const [x0, y0, x1, y1] = field.rect;
    el.style.left = (x0 * currentScale) + 'px';
    el.style.top = (y0 * currentScale) + 'px';
    el.style.width = ((x1 - x0) * currentScale) + 'px';
    el.style.height = ((y1 - y0) * currentScale) + 'px';
}

function selectField(fieldName) {
    selectedFieldName = fieldName;
    const field = currentFields.find(f => f.name === fieldName);
    if (!field) return;
    
    document.querySelectorAll('.field-rect.selected').forEach(el => el.classList.remove('selected'));
    const el = document.querySelector(`[data-field-name="${CSS.escape(fieldName)}"]`);
    if (el) el.classList.add('selected');
    
    noSelection.style.display = 'none';
    fieldProperties.style.display = 'block';
    
    propName.value = field.name;
    propType.value = field.type_input || 'text';
    propCells.value = field.max_len || 0;
    propFontSize.value = field.font_size || 10;
    propAlign.value = field.align || 'left';
    
    const [x0, y0, x1, y1] = field.rect;
    propPosition.textContent = `X: ${x0.toFixed(0)}, Y: ${y0.toFixed(0)}`;
    propSize.textContent = `${(x1-x0).toFixed(0)} × ${(y1-y0).toFixed(0)}`;
}

// Actualizar propiedades
propType.addEventListener('change', () => {
    const field = currentFields.find(f => f.name === selectedFieldName);
    if (field) field.type_input = propType.value;
});

propCells.addEventListener('input', () => {
    const field = currentFields.find(f => f.name === selectedFieldName);
    if (field) {
        field.max_len = parseInt(propCells.value) || 0;
        const el = document.querySelector(`[data-field-name="${CSS.escape(selectedFieldName)}"]`);
        if (el) el.classList.toggle('comb', field.max_len > 0);
    }
});

propFontSize.addEventListener('input', () => {
    const field = currentFields.find(f => f.name === selectedFieldName);
    if (field) field.font_size = parseInt(propFontSize.value) || 10;
});

propAlign.addEventListener('change', () => {
    const field = currentFields.find(f => f.name === selectedFieldName);
    if (field) field.align = propAlign.value;
});

deleteField.addEventListener('click', () => {
    if (!selectedFieldName) return;
    if (!confirm('¿Eliminar este campo del formulario?')) return;
    
    const idx = currentFields.findIndex(f => f.name === selectedFieldName);
    if (idx >= 0) currentFields.splice(idx, 1);
    
    const el = document.querySelector(`[data-field-name="${CSS.escape(selectedFieldName)}"]`);
    if (el) el.remove();
    
    fieldCounter.textContent = currentFields.length + ' campos detectados';
    clearSelection();
});

// Botón "×" del panel ahora solo limpia la selección (no oculta el panel)
const closePanelBtn = document.getElementById('closePanel');
if (closePanelBtn) {
    closePanelBtn.addEventListener('click', clearSelection);
}

function clearSelection() {
    selectedFieldName = null;
    document.querySelectorAll('.field-rect.selected').forEach(el => el.classList.remove('selected'));
    noSelection.style.display = 'block';
    fieldProperties.style.display = 'none';
}

function makeDraggable(el, field) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    el.addEventListener('mousedown', (e) => {
        if (!showFields) return;
        isDragging = true;
        el.classList.add('dragging');
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseFloat(el.style.left);
        startTop = parseFloat(el.style.top);
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        el.style.left = (startLeft + dx) + 'px';
        el.style.top = (startTop + dy) + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        el.classList.remove('dragging');
        
        const newX = parseFloat(el.style.left) / currentScale;
        const newY = parseFloat(el.style.top) / currentScale;
        const width = (field.rect[2] - field.rect[0]);
        const height = (field.rect[3] - field.rect[1]);
        
        const fieldData = currentFields.find(f => f.name === field.name);
        if (fieldData) {
            fieldData.rect = [newX, newY, newX + width, newY + height];
            if (selectedFieldName === field.name) {
                propPosition.textContent = `X: ${newX.toFixed(0)}, Y: ${newY.toFixed(0)}`;
            }
        }
    });
}

saveBtn.addEventListener('click', async () => {
    if (!currentSession) return;
    saveBtn.textContent = 'Guardando...';
    saveBtn.disabled = true;
    
    const updates = currentFields.map(f => ({ 
        name: f.name, 
        rect: f.rect,
        max_len: f.max_len || 0,
        font_size: f.font_size || 10,
        align: f.align || 'left',
        type_input: f.type_input || 'text'
    }));
    
    try {
        const response = await fetch('/api/session/' + currentSession + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates })
        });
        
        if (!response.ok) throw new Error('Error al guardar');
        
        saveBtn.textContent = '✅ Guardado';
        setTimeout(() => { saveBtn.textContent = '💾 Guardar cambios'; saveBtn.disabled = false; }, 2000);
        
        downloadBtn.href = '/api/session/' + currentSession + '/download';
        downloadBtn.style.display = 'inline-block';
    } catch (error) {
        saveBtn.textContent = '❌ Error';
        setTimeout(() => { saveBtn.textContent = '💾 Guardar cambios'; saveBtn.disabled = false; }, 2000);
    }
});

resetBtn.addEventListener('click', () => {
    currentFields = JSON.parse(JSON.stringify(originalFields));
    renderPdf();
    downloadBtn.style.display = 'none';
    clearSelection();
});

toggleFields.addEventListener('click', () => {
    showFields = !showFields;
    toggleFields.classList.toggle('active', showFields);
    fieldElements.forEach(el => { el.style.display = showFields ? 'block' : 'none'; });
});

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (pdfDoc && editorView.style.display !== 'none') {
            renderPdf();
        }
    }, 300);
});
