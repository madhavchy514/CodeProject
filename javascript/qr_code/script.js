const urlInput = document.getElementById("url-input");
const createBtn = document.getElementById("create-btn");
const qrOutput = document.getElementById("qr-output");
const downloadBtn = document.getElementById("download-btn");
const dropArea = document.getElementById("drop-area");
const qrInput = document.getElementById("qr-input");
const urlOutput = document.getElementById("url-output");
const copyBtn = document.getElementById("copy-btn");
qrOutput.style.display = "none";
downloadBtn.style.display = "none";
qrInput.style.display = "none";
urlOutput.style.display = "none";
copyBtn.style.display = "none";
function createQRCode() {
  const textToEncode = urlInput.value;
  if (textToEncode.trim() === "" || textToEncode.length > 1500) {
    alert("Text must be 1-1500 character");
    return false;
  }
  try {
    qrOutput.innerHTML = "";
    qrOutput.style.display = "none";
    downloadBtn.style.display = "none";
    const qrcode = new QRCode(qrOutput, {
      text: textToEncode,
      width: 1024,
      height: 1024,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
    setTimeout(() => {
      qrOutput.style.display = "flex";
      downloadBtn.style.display = "block";
    }, 200);
    return true;
  } catch (err) {
    alert(`Failed to create QRCode: ${err.message}`);
    return false;
  }
}
function downloadQRCode() {
  const canvas = qrOutput.querySelector("canvas");
  if (!canvas) {
    alert("No QRCode was created");
    return false;
  }
  const dataURL = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = "qrcode.png";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
async function decodeQRCode(file) {
  urlOutput.style.display = "none";
  copyBtn.style.display = "none";
  const reader = await (async () => new Promise((res) => {
    const reader = new FileReader();
    reader.onload = () => res(reader);
    reader.onerror = (err) => {
      alert(`Failed to decode file: ${err.message}`);
      res(null);
    }
    reader.readAsDataURL(file);
  }))();
  if (reader === null) return false;
  const img = await (async () => new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = (err) => {
      alert(`Failed to decode file: ${err.message}`);
      res(null);
    }
    img.src = reader.result;
  }))();
  if (img === null) return false;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const context = canvas.getContext("2d");
  context.drawImage(img, 0, 0, img.width, img.height);
  const imageData = context.getImageData(0, 0, img.width, img.height);
  const urlObj = jsQR(imageData.data, imageData.width, imageData.height);
  if (!urlObj) {
    alert("Failed to decode file");
    return false;
  }
  const url = urlObj.data;
  urlOutput.innerHTML = url;
  urlOutput.style.display = "block";
  copyBtn.style.display = "block";
  return true;
}
async function copyURL() {
  return await navigator.clipboard.writeText(urlOutput.innerHTML)
    .then(() => {
      return true;
    })
    .catch((err) => {
      alert(`Failed to copy URL: ${err.message}`);
      return false;
    });
}
async function uploadQRCode(e) {
  const file = e.target.files[0];
  if (!file) {
    alert("Failed to upload file");
    return false;
  }
  return decodeQRCode(file);
}
async function dropQRCode(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    return decodeQRCode(file);
  } else {
    alert("Invalid file type uploaded");
    return false;
  }
}
createBtn.addEventListener("click", () => createQRCode());
downloadBtn.addEventListener("click", () => downloadQRCode());
qrInput.addEventListener("change", (e) => uploadQRCode(e));
dropArea.addEventListener("click", (e) => qrInput.click());
dropArea.addEventListener("dragover", (e) => e.preventDefault());
dropArea.addEventListener("drop", (e) =>  dropQRCode(e));
copyBtn.addEventListener("click", () => copyURL());