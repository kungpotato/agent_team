import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = '/tmp/agent_team_gif_frames';
const PROFILE_DIR = '/tmp/chrome_record_profile_' + Date.now();
const OUTPUT_GIF = path.resolve(__dirname, '../public/assets/demo.gif');
const PORT = 9334;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function api(endpoint, method = 'POST', body = {}) {
  try {
    const res = await fetch(`http://localhost:3333${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    console.error('API Error:', endpoint, e.message);
  }
}

async function main() {
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('1. Setting up office agents state...');
  await api('/api/reset');
  await sleep(400);

  // Setup agents at desks
  await api('/api/agents/work', 'POST', { name: 'pm1', task: 'Sprint Planning PRD', progress: 45 });
  await api('/api/agents/work', 'POST', { name: 'coder1', task: 'Implementing Auth API', progress: 85 });
  await api('/api/agents/work', 'POST', { name: 'qa1', task: 'End-to-End Test Suite', progress: 70 });
  await api('/api/agents/work', 'POST', { name: 'devops1', task: 'CI/CD Pipeline Canary', progress: 30 });

  // Setup meeting in room 1
  await api('/api/agents/meet', 'POST', {
    names: ['architect1', 'reviewer1'],
    room: 1,
    topic: 'API Security Review'
  });

  await sleep(1000);

  console.log('2. Launching Chrome headless for screencast...');
  const chromeProc = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--window-size=1280,820',
    '--hide-scrollbars',
    'http://localhost:3333'
  ], { stdio: 'ignore' });

  // Wait for DevTools port
  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://localhost:${PORT}/json`);
      const list = await res.json();
      const page = list.find(item => item.type === 'page' && item.url.includes('3333'));
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch {}
  }

  if (!wsUrl) {
    console.error('Could not connect to Chrome DevTools');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('3. Connecting to Chrome Page via WebSocket...');
  const ws = new WebSocket(wsUrl);
  let frameCount = 0;
  let capturing = false;

  await new Promise((resolve) => ws.on('open', resolve));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.method === 'Page.screencastFrame') {
        const { data: base64Data, sessionId } = msg.params;
        if (capturing) {
          frameCount++;
          const framePath = path.join(FRAMES_DIR, `frame_${String(frameCount).padStart(4, '0')}.png`);
          fs.writeFileSync(framePath, Buffer.from(base64Data, 'base64'));
        }
        // Acknowledge frame
        ws.send(JSON.stringify({
          id: Math.floor(Math.random() * 1000000),
          method: 'Page.screencastFrameAck',
          params: { sessionId }
        }));
      }
    } catch (e) {
      console.error('Frame error:', e.message);
    }
  });

  console.log('4. Starting screencast stream...');
  ws.send(JSON.stringify({
    id: 1,
    method: 'Page.startScreencast',
    params: {
      format: 'png',
      everyNthFrame: 2,
      maxWidth: 1280,
      maxHeight: 820
    }
  }));

  await sleep(1500); // let canvas stabilize
  capturing = true;
  console.log('Recording started...');

  // Start desk visit action!
  console.log('Triggering: pm1 visits coder1...');
  await api('/api/agents/visit', 'POST', {
    from: 'pm1',
    to: 'coder1',
    question: 'Is auth ready?',
    reply: 'Yes, shipping now!',
    stay: true
  });

  // Record for 6 seconds (covers walking along aisles, standing, speech bubbles popping up)
  await sleep(6500);

  capturing = false;
  console.log(`Captured ${frameCount} frames.`);

  ws.send(JSON.stringify({ id: 2, method: 'Page.stopScreencast' }));
  ws.close();
  chromeProc.kill('SIGKILL');
  fs.rmSync(PROFILE_DIR, { recursive: true, force: true });

  console.log('5. Converting frames into animated GIF using ffmpeg...');
  const ffmpegCmd = [
    '-y',
    '-framerate', '10',
    '-i', path.join(FRAMES_DIR, 'frame_%04d.png'),
    '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
    OUTPUT_GIF
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ffmpegCmd, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  const stat = fs.statSync(OUTPUT_GIF);
  console.log(`✅ Successfully generated ${OUTPUT_GIF} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(err => {
  console.error('Recording failed:', err);
  process.exit(1);
});
