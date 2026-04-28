const slider = document.querySelector('input[type="range"]');

window.addEventListener('load', seekOne);
slider.addEventListener('input', seekOne);

function seekOne (){
  const value = slider.value;
  document.querySelector("#b").innerHTML = value;
  slider.style.background = 
  `linear-gradient(
    to right, 
    #4CAF50 0%, 
    #4CAF50 ${((value - slider.min) / (slider.max - slider.min)) * 100}%, 
    #ddd ${((value - slider.min) / (slider.max - slider.min)) * 100}%, 
    #ddd 100%
  )`;
}

slider.dispatchEvent(new Event('input'));

const colorer = document.getElementById("colorPicker")
window.addEventListener('load', seekTwo);
colorer.addEventListener("input", seekTwo)

function seekTwo(){
  const value = colorer.value;
  const text = value.replace("#", "")
  document.querySelector("#c").innerHTML = text;
}

const controller = document.querySelector('.controller');
let offsetX, offsetY, isDragging = false;
controller.addEventListener('mousedown', function(e) {
  if (e.target.closest('input[type="range"]') || e.target.closest('input[type="color"]') || e.target.closest('button')) 
    return;
  isDragging = true;
  offsetX = e.clientX - controller.getBoundingClientRect().left;
  offsetY = e.clientY - controller.getBoundingClientRect().top;
  controller.style.transition = "none";
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
});

function onMouseMove(e) {
  if (!isDragging) return;
  let left = e.clientX - offsetX;
  let top = e.clientY - offsetY;
  left = Math.max(0, Math.min(window.innerWidth - controller.offsetWidth, left));
  top = Math.max(0, Math.min(window.innerHeight - controller.offsetHeight, top));
  controller.style.left = left + 'px';
  controller.style.top = top + 'px';
}

function onMouseUp() {
  if (!isDragging) return;
  isDragging = false;
  controller.style.transition = "left 0.1s ease, top 0.1s ease";
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

function windowLoad(){
  brushSizeInput.value = brushSize
  colorPicker.value = ctx.strokeStyle;
  updateButtonStates()
  brushButton.click()
}

function windowResize() {
  ctx.lineWidth = brushSizeInput.value;
  ctx.strokeStyle = colorPicker.value;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  saveState();
}

function clear() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  undoStack = [];
  redoStack = [];
  updateButtonStates()
}

function undo() {
  if (undoStack.length === 0) return;
  const currentState = undoStack.pop();
  redoStack.push(currentState)
  const lastState = undoStack.length > 0 ? undoStack[undoStack.length - 1] : null
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (lastState) {ctx.putImageData(lastState, 0, 0);}
  updateButtonStates();
}

function redo() {
  if (redoStack.length === 0) return;
  const currentState = redoStack.pop();
  undoStack.push(currentState);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.putImageData(currentState, 0, 0);
  updateButtonStates();
}

function saveState() {
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  redoStack = [];
  updateButtonStates();
}    

function updateButtonStates() {
  undoButton.disabled = undoStack.length === 0;
  redoButton.disabled = redoStack.length === 0;
}

function setDrawingMode(mode) {
  isBrushMode = mode === 'brush' && (isBrushMode = !isBrushMode);
  isEraserMode = mode === 'eraser' && (isEraserMode = !isEraserMode);
  isSolidLineMode = mode === 'solidLine' && (isSolidLineMode = !isSolidLineMode);
  isDashedLineMode = mode === 'dashedLine' && (isDashedLineMode = !isDashedLineMode);
  isArrowLineMode = mode === 'arrowLine' && (isArrowLineMode = !isArrowLineMode);
  
  brushButton.style.backgroundColor = '';
  eraserButton.style.backgroundColor = '';
  solidLineButton.style.backgroundColor = '';
  dashedLineButton.style.backgroundColor = '';
  arrowLineButton.style.backgroundColor = '';
  
  if (isBrushMode) brushButton.style.backgroundColor = '#45a049';
  if (isEraserMode) eraserButton.style.backgroundColor = '#45a049';
  if (isSolidLineMode) solidLineButton.style.backgroundColor = '#45a049';
  if (isDashedLineMode) dashedLineButton.style.backgroundColor = '#45a049';
  if (isArrowLineMode) arrowLineButton.style.backgroundColor = '#45a049';
}

function start(e) {
  if(!isBrushMode && !isEraserMode && !isSolidLineMode && !isDashedLineMode && !isArrowLineMode) return;
  draw = true;
  lastX = e.clientX;
  lastY = e.clientY;
  if (isBrushMode || isDashedLineMode || isSolidLineMode || isArrowLineMode) {drawInk(lastX, lastY, e.clientX, e.clientY);} 
  else if (isEraserMode) {eraseInk(lastX, lastY, e.clientX, e.clientY);}
}

function runing(e) {
  if (!draw) return;
  if(!isBrushMode && !isEraserMode && !isSolidLineMode && !isDashedLineMode  && !isArrowLineMode) return;
  const currentX = e.clientX;
  const currentY = e.clientY;
  if (isBrushMode) {
    drawInk(lastX, lastY, currentX, currentY); 
    lastX = currentX;
    lastY = currentY;
  } else if (isEraserMode) {
    eraseInk(lastX, lastY, currentX, currentY);
    lastX = currentX;
    lastY = currentY;
  } else if (isSolidLineMode || isDashedLineMode || isArrowLineMode) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (undoStack.length > 0) {ctx.putImageData(undoStack[undoStack.length - 1], 0, 0);}
    drawInk(lastX, lastY, currentX, currentY);
  }
}

function stop() {
  if(!isBrushMode && !isEraserMode && !isSolidLineMode && !isDashedLineMode  && !isArrowLineMode) return;
  if (draw) {saveState();}
  draw = false;
}

function drawInk(x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  
  if(isSolidLineMode) {ctx.setLineDash([]);}
  else if (isDashedLineMode) {ctx.setLineDash([15,15]);} 
  else if (isArrowLineMode) {ctx.setLineDash([]);}
  else {ctx.setLineDash([]);}
  
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if(isArrowLineMode) {drawArrowhead(x1, y1, x2, y2);}
}

function eraseInk(x1, y1, x2, y2) {
  ctx.globalCompositeOperation = "destination-out";
  ctx.lineWidth = brushSize;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";
}

function drawArrowhead(x1, y1, x2, y2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 15;
  const arrowAngle = Math.PI / 6;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - arrowLength * Math.cos(angle - arrowAngle),
    y2 - arrowLength * Math.sin(angle - arrowAngle)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - arrowLength * Math.cos(angle + arrowAngle),
    y2 - arrowLength * Math.sin(angle + arrowAngle)
  );
  ctx.stroke();
}

function downloadCanvas(){
  const dataURL = canvas.toDataURL('image/jpg');   
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'canvas.jpg';
  a.click();
}

const canvas = document.getElementById("canvas")
const ctx = canvas.getContext("2d", { willReadFrequently: true })

canvas.width = 1366
canvas.height = 768

let draw = false
let isBrushMode = false
let isEraserMode = false
let isSolidLineMode = false
let isDashedLineMode = false
let isArrowLineMode = false

let lastX = 0
let lastY = 0
let undoStack = []
let redoStack = []
let brushSize = 5

ctx.lineJoin = "round";
ctx.lineCap = "round";
ctx.strokeStyle = "#fff"; 
ctx.lineWidth = brushSize

const brushSizeInput = document.getElementById("brushSize")
const colorPicker = document.getElementById("colorPicker")
const brushButton = document.getElementById("brush")
const eraserButton = document.getElementById("eraser")
const solidLineButton = document.getElementById("solidLine")
const dashedLineButton = document.getElementById("dashedLine")
const arrowLineButton = document.getElementById("arrowLine")
const clearButton = document.getElementById("clear")
const undoButton = document.getElementById("undo")
const redoButton = document.getElementById("redo")
const download = document.getElementById("download")

window.addEventListener("DOMContentLoaded", windowLoad)
window.addEventListener("resize", windowResize)

canvas.addEventListener("mousedown", start)
canvas.addEventListener("mousemove", runing)
canvas.addEventListener("mouseup", stop)

clearButton.addEventListener("click", clear)
undoButton.addEventListener("click", undo)
redoButton.addEventListener("click", redo)
download.addEventListener("click", downloadCanvas)

brushButton.addEventListener("click", () => setDrawingMode('brush'))
eraserButton.addEventListener("click", () => setDrawingMode('eraser'))
solidLineButton.addEventListener("click", () => setDrawingMode('solidLine'))
dashedLineButton.addEventListener("click", () => setDrawingMode('dashedLine'))
arrowLineButton.addEventListener("click", () => setDrawingMode('arrowLine'))

colorPicker.addEventListener("input", (e) => { 
  ctx.strokeStyle = e.target.value;
});

brushSizeInput.addEventListener("input", (e) => {
  brushSize = e.target.value;
  ctx.lineWidth = brushSize;
});