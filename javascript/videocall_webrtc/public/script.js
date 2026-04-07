let pc = null;
let stream = null;

let roomId = null;
let alertTimeout = undefined;

let myId = null;
let otherId = null;

let makingOffer = false;
let ignoreOffer = false;
let isPolite = false;

const localVideo = document.getElementById('local');
const remoteVideo = document.getElementById('remote');
const alertDiv = document.getElementById('alert');
const roomDiv = document.getElementById('room');
const micBtn = document.getElementById('mic');
const camBtn = document.getElementById('cam');

const socket = io();

function showAlert(msg, ms = 2000) {
  clearTimeout(alertTimeout);
  alertDiv.textContent = msg;
  alertDiv.classList.add('show');
  alertTimeout = setTimeout(() => {
    alertDiv.classList.remove('show');
  }, ms);
}

function getRoomId() {
  roomId = new URLSearchParams(window.location.search).get('room');
  if (!roomId) {
    roomId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    window.location.search = `?room=${roomId}`;
  }
  roomDiv.textContent = `room#${roomId}`;
}

function updateRole() {
  if (!myId || !otherId) return;
  isPolite = myId > otherId;
  console.log('polite:', isPolite);
  maybeNegotiate();
}

async function maybeNegotiate() {
  if (!pc) return;
  if (!myId || !otherId) return;
  if (pc.signalingState !== 'stable') return;
  if (makingOffer) return;

  try {
    makingOffer = true;
    await pc.setLocalDescription(await pc.createOffer());
    socket.emit('signal', {
      room: roomId,
      signal: { sdp: pc.localDescription }
    });
  } catch (e) {
    console.error(e);
  } finally {
    makingOffer = false;
  }
}

function createPeerConnection() {
  if (!stream) return;
  if (pc) pc.close();

  pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  stream.getTracks().forEach(t => pc.addTrack(t, stream));

  pc.ontrack = (e) => {
    remoteVideo.srcObject = e.streams[0];
  };

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit('signal', {
        room: roomId,
        signal: { candidate }
      });
    }
  };

  pc.onnegotiationneeded = async () => {
    if (!myId || !otherId) return;

    try {
      makingOffer = true;
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit('signal', {
        room: roomId,
        signal: { sdp: pc.localDescription }
      });
    } catch (e) {
      console.error(e);
    } finally {
      makingOffer = false;
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed') {
      showAlert('connection succeeded');
    }
  };
}

socket.on('joined', (id) => {
  myId = id;
  updateRole();
});

socket.on('user-join', (id) => {
  otherId = id;
  updateRole();
});

socket.on('signal', async ({ signal }) => {
  if (!pc) return;

  try {
    if (signal.sdp) {
      const offerCollision =
        signal.sdp.type === 'offer' &&
        (makingOffer || pc.signalingState !== 'stable');

      ignoreOffer = !isPolite && offerCollision;
      if (ignoreOffer) return;

      await pc.setRemoteDescription(signal.sdp);

      if (signal.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('signal', {
          room: roomId,
          signal: { sdp: pc.localDescription }
        });
      }
    } else if (signal.candidate) {
      try {
        await pc.addIceCandidate(signal.candidate);
      } catch (e) {
        if (!ignoreOffer) throw e;
      }
    }
  } catch (e) {
    console.error(e);
  }
});

socket.on('user-left', () => {
  remoteVideo.srcObject = null;
  otherId = null;
  createPeerConnection();
});

socket.on('full', () => {
  showAlert('room is full');
});

micBtn.onclick = () => {
  const t = stream.getAudioTracks()[0];
  t.enabled = !t.enabled;
  micBtn.textContent = t.enabled ? 'mute mic' : 'unmute mic';
};

camBtn.onclick = () => {
  const t = stream.getVideoTracks()[0];
  t.enabled = !t.enabled;
  camBtn.textContent = t.enabled ? 'stop cam' : 'start cam';
};

async function start() {
  getRoomId();

  stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  localVideo.srcObject = stream;
  createPeerConnection();
  socket.emit('join-room', roomId);
}

start();