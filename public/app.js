/**
 * AGENT HQ - Tech Startup 8-Bit Virtual Office
 * 5 Long Workbench Desks (8 seats each = 40 seats) + 5 Meeting Rooms
 */

const canvas = document.getElementById('office-canvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const spriteRenderer = new SpriteRenderer(ctx);

// State
let agents = [];
let meetingTopics = {};
let meetingQueue = [];
let visits = [];
const visitAnims = new Map();
let currentSprint = null;
let animationFrame = 0;
let particles = [];

// Multi-session State (Defaults to URL param, saved localStorage, or 'agent_team')
const urlParams = new URLSearchParams(window.location.search);
let currentSessionId = urlParams.get('session') || localStorage.getItem('agent_hq_session') || 'agent_team';
let knownSessions = [];

async function apiFetch(endpoint, options = {}) {
  const url = new URL(endpoint, window.location.origin);
  if (!url.searchParams.has('session')) {
    url.searchParams.set('session', currentSessionId);
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-session-id': currentSessionId,
    ...(options.headers || {})
  };

  let body = options.body;
  if (body && typeof body === 'string') {
    try {
      const parsed = JSON.parse(body);
      if (!parsed.session) {
        parsed.session = currentSessionId;
        body = JSON.stringify(parsed);
      }
    } catch {
      // not JSON
    }
  }

  return fetch(url.toString(), { ...options, headers, body });
}



// BENCH CONFIGURATION (5 Departments x 8 seats = 40 workstations)
// 1. PRODUCT | 2. DESIGNER | 3. TECH (FE+BE+QA) | 4. DEVOPS | 5. AI & DATA
const BENCHES = [
  { name: 'BENCH 1 // PRODUCT',                       y: 195, tag: 'PROD', dept: 'PRODUCT',   color: '#8a2be2' },
  { name: 'BENCH 2 // DESIGNER',                      y: 325, tag: 'DSGN', dept: 'DESIGNER',  color: '#ff1493' },
  { name: 'BENCH 3 // TECH (FRONTEND + BACKEND + QA)', y: 455, tag: 'TECH', dept: 'TECH',      color: '#38bdf8' },
  { name: 'BENCH 4 // DEVOPS',                        y: 585, tag: 'OPS',  dept: 'DEVOPS',    color: '#00ffff' },
  { name: 'BENCH 5 // AI & DATA',                     y: 725, tag: 'DATA', dept: 'AI & DATA', color: '#a855f7' }
];

// Calculate 8 seat X coordinates per bench (spaced 80px apart)
const SEAT_X_OFFSETS = [75, 155, 235, 315, 395, 475, 555, 635];

// OFFICE LAYOUT COORDINATES (Canvas: 1440 x 850)
const OFFICE_LAYOUT = {
  // WORK ROOM (Left Wing: X: 0 to 760)
  workRoom: {
    x: 0,
    y: 0,
    w: 760,
    h: 850,
    deskX: 35,
    deskW: 690,
    deskH: 26, // Sleek low-profile Scandinavian oak desk
    benches: BENCHES.map((b, bIdx) => ({
      name: b.name,
      y: b.y,
      slots: SEAT_X_OFFSETS.map((x, sIdx) => ({
        x,
        y: b.y - 14,
        slotIndex: bIdx * 8 + sIdx
      }))
    }))
  },

  // 5 MEETING ROOMS (Right Wing: X: 760 to 1440) - 8 SEATS EACH
  meetingRooms: {
    1: {
      name: '[Σ] SIGMA',
      symbol: 'Σ',
      subtitle: 'Sigma Room (Summation - 8 Seats)',
      x: 780, y: 45, w: 310, h: 220,
      tableX: 935, tableY: 158, tableW: 190, tableH: 48,
      slots: [
        { x: 865, y: 124 },
        { x: 910, y: 124 },
        { x: 955, y: 124 },
        { x: 1000, y: 124 },
        { x: 865, y: 194 },
        { x: 910, y: 194 },
        { x: 955, y: 194 },
        { x: 1000, y: 194 }
      ]
    },
    2: {
      name: '[Δ] DELTA',
      symbol: 'Δ',
      subtitle: 'Delta Room (Differential - 8 Seats)',
      x: 1110, y: 45, w: 310, h: 220,
      tableX: 1265, tableY: 158, tableW: 190, tableH: 48,
      slots: [
        { x: 1195, y: 124 },
        { x: 1240, y: 124 },
        { x: 1285, y: 124 },
        { x: 1330, y: 124 },
        { x: 1195, y: 194 },
        { x: 1240, y: 194 },
        { x: 1285, y: 194 },
        { x: 1330, y: 194 }
      ]
    },
    3: {
      name: '[λ] LAMBDA',
      symbol: 'λ',
      subtitle: 'Lambda Room (Calculus - 8 Seats)',
      x: 780, y: 285, w: 310, h: 220,
      tableX: 935, tableY: 398, tableW: 190, tableH: 48,
      slots: [
        { x: 865, y: 364 },
        { x: 910, y: 364 },
        { x: 955, y: 364 },
        { x: 1000, y: 364 },
        { x: 865, y: 434 },
        { x: 910, y: 434 },
        { x: 955, y: 434 },
        { x: 1000, y: 434 }
      ]
    },
    4: {
      name: '[Ω] OMEGA',
      symbol: 'Ω',
      subtitle: 'Omega Room (Resistance - 8 Seats)',
      x: 1110, y: 285, w: 310, h: 220,
      tableX: 1265, tableY: 398, tableW: 190, tableH: 48,
      slots: [
        { x: 1195, y: 364 },
        { x: 1240, y: 364 },
        { x: 1285, y: 364 },
        { x: 1330, y: 364 },
        { x: 1195, y: 434 },
        { x: 1240, y: 434 },
        { x: 1285, y: 434 },
        { x: 1330, y: 434 }
      ]
    },
    5: {
      name: '[∞] INFINITY BOARDROOM',
      symbol: '∞',
      subtitle: 'Infinity Boardroom (All-Hands - 8 Seats)',
      x: 780, y: 525, w: 640, h: 295,
      tableX: 1100, tableY: 670, tableW: 380, tableH: 64,
      slots: [
        { x: 965,  y: 625 },
        { x: 1055, y: 625 },
        { x: 1145, y: 625 },
        { x: 1235, y: 625 },
        { x: 965,  y: 715 },
        { x: 1055, y: 715 },
        { x: 1145, y: 715 },
        { x: 1235, y: 715 }
      ]
    }
  }
};

/**
 * 8-Bit Smoke Puff / Disappear Particle System
 */
class PoofParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 5;
    this.vy = (Math.random() - 0.5) * 5 - 1.5;
    this.size = Math.random() * 9 + 6;
    this.alpha = 1;
    this.color = ['#ffffff', '#cbd5e1', '#94a3b8', '#00ffcc', '#ff9f43', '#a855f7'][Math.floor(Math.random() * 6)];
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.size *= 0.93;
    this.alpha -= 0.035;
    return this.alpha > 0 && this.size > 1;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.fillRect(Math.floor(this.x), Math.floor(this.y), Math.floor(this.size), Math.floor(this.size));
    ctx.restore();
  }
}

function spawnPoof(x, y) {
  for (let i = 0; i < 22; i++) {
    particles.push(new PoofParticle(x, y));
  }
  window.soundSystem.playPoof();
}

/**
 * DRAW BACKGROUND & FLOORS
 */
function drawOffice() {
  // Clear full canvas
  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. WORK ROOM FLOOR & WALLS
  // Wall Top Area
  ctx.fillStyle = '#171c2d';
  ctx.fillRect(0, 0, 760, 115);
  ctx.fillStyle = '#26304d';
  ctx.fillRect(0, 110, 760, 6); // Baseboard

  // Hardwood Parquet Floor (Tech startup warm wood finish)
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, 116, 760, 734);
  ctx.strokeStyle = '#451a03';
  ctx.lineWidth = 1.5;
  for (let y = 116; y < 850; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(760, y);
    ctx.stroke();
  }
  for (let x = 0; x < 760; x += 68) {
    ctx.beginPath();
    ctx.moveTo(x, 116);
    ctx.lineTo(x, 850);
    ctx.stroke();
  }

  // Divider Wall between Work Room & Conference Wing
  ctx.fillStyle = '#334155';
  ctx.fillRect(760, 0, 10, 850);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.fillRect(750, 0, 20, 850);

  // Conference Wing Floor (Polished Midnight Slate)
  ctx.fillStyle = '#0b1329';
  ctx.fillRect(770, 0, 670, 850);
  ctx.strokeStyle = '#182245';
  ctx.lineWidth = 1;
  for (let y = 0; y < 850; y += 30) {
    ctx.beginPath();
    ctx.moveTo(770, y);
    ctx.lineTo(1440, y);
    ctx.stroke();
  }
  for (let x = 770; x < 1440; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 850);
    ctx.stroke();
  }

  // Draw Startup Kitchenette / Lounge / Whiteboards
  drawStartupDecor();

  // Draw 5 Long Benches (40 seats)
  drawWorkRoomBenches();

  // Draw Visiting Agents Walking / Standing at colleagues' desks
  drawVisitingAgents();

  // Draw 5 Conference Rooms
  drawMeetingRooms();
}


/**
 * Draw Startup Decor (Kanban board, Neon sign, Coffee bar, Arcade machine, Plants)
 */
function drawStartupDecor() {
  // Title & Neon Sign
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillStyle = '#00ffcc';
  ctx.shadowColor = '#00ffcc';
  ctx.shadowBlur = 8;
  ctx.textAlign = 'left';
  ctx.fillText('⚡ TECH STARTUP HQ // OPEN SPACE', 24, 25);
  ctx.shadowBlur = 0;

  // Kanban Sprint Board on Wall
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(25, 40, 160, 65);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 3;
  ctx.strokeRect(25, 40, 160, 65);

  ctx.font = '6px "Press Start 2P", monospace';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('TODO', 40, 52);
  ctx.fillText('DOING', 90, 52);
  ctx.fillText('PROD', 145, 52);

  // Kanban Sticky notes (Yellow, Pink, Cyan)
  ctx.fillStyle = '#fef08a'; ctx.fillRect(38, 58, 16, 12);
  ctx.fillStyle = '#f472b6'; ctx.fillRect(38, 74, 16, 12);
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(92, 58, 16, 12);
  ctx.fillStyle = '#4ade80'; ctx.fillRect(144, 58, 16, 12);
  ctx.fillStyle = '#fef08a'; ctx.fillRect(144, 74, 16, 12);

  if (currentSprint && currentSprint.activeCeremony) {
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(27, 92, 156, 11);
    ctx.font = '5px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentSprint.activeCeremony.shortName}`, 105, 100);
    ctx.textAlign = 'left';
  }

  // Startup Coffee & Energy Drink Bar
  const barX = 210;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(barX, 45, 130, 60);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, 45, 130, 60);

  // Espresso Machine
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(barX + 10, 55, 24, 30);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(barX + 16, 70, 12, 12);

  // Glass Drink Fridge (with energy drinks)
  ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.fillRect(barX + 45, 50, 75, 48);
  ctx.strokeStyle = '#0284c7';
  ctx.strokeRect(barX + 45, 50, 75, 48);
  // Pixel drink cans
  const canColors = ['#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7'];
  for (let c = 0; c < 6; c++) {
    ctx.fillStyle = canColors[c % canColors.length];
    ctx.fillRect(barX + 50 + c * 11, 56, 7, 14);
    ctx.fillRect(barX + 50 + c * 11, 74, 7, 14);
  }

  // Ticking Startup Clock
  const clockX = 375;
  const clockY = 75;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(clockX, clockY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 3;
  ctx.stroke();
  const secAngle = (animationFrame * 0.05) % (Math.PI * 2);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(clockX, clockY);
  ctx.lineTo(clockX + Math.cos(secAngle) * 14, clockY + Math.sin(secAngle) * 14);
  ctx.stroke();

  // Retro Arcade Cabinet in Corner
  const arcX = 425;
  ctx.fillStyle = '#7c3aed';
  ctx.fillRect(arcX, 35, 34, 72);
  ctx.fillStyle = '#06b6d4';
  ctx.fillRect(arcX + 4, 45, 26, 22); // Screen
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(arcX + 8, 72, 8, 4);  // Joystick
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(arcX + 22, 73, 4, 4); // Buttons

  // Potted Fiddle Leaf Fig Plants
  for (let pIdx = 0; pIdx < 2; pIdx++) {
    const px = 490 + pIdx * 45;
    ctx.fillStyle = '#b45309';
    ctx.fillRect(px, 75, 24, 28); // Pot
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(px + 12, 60, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(px + 8, 52, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2 Dual Server Racks (Far Right of Work Room)
  for (let r = 0; r < 2; r++) {
    const rx = 600 + r * 65;
    ctx.fillStyle = '#090d16';
    ctx.fillRect(rx, 35, 54, 75);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, 35, 54, 75);
    for (let row = 0; row < 3; row++) {
      const ly = 42 + row * 22;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(rx + 4, ly, 46, 16);
      const on = (animationFrame + row * 6 + r * 8) % 16 < 9;
      ctx.fillStyle = on ? '#22c55e' : '#14532d';
      ctx.fillRect(rx + 8, ly + 4, 4, 4);
      ctx.fillRect(rx + 16, ly + 4, 4, 4);
      ctx.fillStyle = (animationFrame + row * 5) % 12 < 6 ? '#38bdf8' : '#0369a1';
      ctx.fillRect(rx + 26, ly + 4, 4, 4);
      ctx.fillStyle = (animationFrame + row * 9) % 15 < 7 ? '#f59e0b' : '#78350f';
      ctx.fillRect(rx + 36, ly + 4, 4, 4);
    }
  }
}

/**
 * Draw 5 Long Workbench Desks
 * Each desk seats 8 agents (40 total seats)
 */
function drawWorkRoomBenches() {
  const benches = OFFICE_LAYOUT.workRoom.benches;
  const deskX = OFFICE_LAYOUT.workRoom.deskX;
  const deskW = OFFICE_LAYOUT.workRoom.deskW;
  const deskH = OFFICE_LAYOUT.workRoom.deskH;

  for (let b = 0; b < benches.length; b++) {
    const bench = benches[b];
    const deskY = bench.y;

    // 1. Bench Name Sign in the open walkway margin to the left (x: 4..32, clear of all seats & chairs!)
    ctx.save();
    ctx.fillStyle = '#090d16';
    ctx.fillRect(4, deskY - 14, 28, 26);
    ctx.strokeStyle = bench.color || '#334155';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(4, deskY - 14, 28, 26);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`B${b + 1}`, 18, deskY - 10);

    const tagShort = bench.tag || ['PROD', 'DSGN', 'TECH', 'OPS', 'DATA'][b];
    ctx.font = '5px "Silkscreen", monospace';
    ctx.fillStyle = bench.color || '#38bdf8';
    ctx.fillText(tagShort, 18, deskY + 2);
    ctx.restore();

    // 2. LAYER 1: Draw Chairs for all 8 seats
    for (let s = 0; s < bench.slots.length; s++) {
      const slot = bench.slots[s];
      spriteRenderer.drawChair(slot.x, slot.y);
    }

    // 3. LAYER 2: Draw Characters (and floating Task HUD / Zzz / Talk above head)
    for (let s = 0; s < bench.slots.length; s++) {
      const slot = bench.slots[s];
      const slotIndex = slot.slotIndex;
      const agentHere = agents.find(a => a.room === 'work' && a.slot === slotIndex);

      if (agentHere) {
        // If this agent has walked out to visit another desk, leave their chair empty
        const isVisitingOut = (agentHere.status === 'walking' || (agentHere.status === 'visiting' && agentHere.currentVisit?.isVisitor) || visitAnims.has(agentHere.name.toLowerCase()));
        if (!isVisitingOut) {
          spriteRenderer.drawCharacter(slot.x, slot.y, agentHere, animationFrame);
          if (agentHere.status === 'working' && Math.random() < 0.04) {
            window.soundSystem.playKeyClick();
          }
        }
      }
    }


    // 4. LAYER 3: Draw Long Wooden Desk Surface (Warm Scandinavian Walnut with bevel)
    ctx.save();
    // Soft shadow below table
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(deskX, deskY + deskH, deskW, 6);

    // Warm Wooden Top
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(deskX, deskY, deskW, deskH - 6);
    // Bevel top edge (highlight)
    ctx.fillStyle = '#a16207';
    ctx.fillRect(deskX, deskY, deskW, 3);
    // Front wooden apron
    ctx.fillStyle = '#713f12';
    ctx.fillRect(deskX, deskY + deskH - 6, deskW, 6);

    // Sleek Industrial Metal Legs (only 12px tall, low-profile)
    const legXPositions = [deskX + 10, deskX + 175, deskX + 345, deskX + 515, deskX + deskW - 20];
    ctx.fillStyle = '#1e293b';
    for (const lx of legXPositions) {
      ctx.fillRect(lx, deskY + deskH, 10, 12);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(lx - 1, deskY + deskH + 10, 12, 2);
      ctx.fillStyle = '#1e293b';
    }
    ctx.restore();

    // 5. LAYER 4: Draw 8 Laptops & Coffee / Drink Mugs on Desk Surface
    for (let s = 0; s < bench.slots.length; s++) {
      const slot = bench.slots[s];
      const slotIndex = slot.slotIndex;
      const agentHere = agents.find(a => a.room === 'work' && a.slot === slotIndex);
      const isWorking = agentHere && agentHere.status === 'working';

      spriteRenderer.drawLaptop(slot.x, deskY + 6, isWorking, animationFrame);

      // Coffee Mug or Soda Can
      if (s % 2 === 0) {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(slot.x + 22, deskY + 8, 7, 7);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(slot.x + 27, deskY + 9, 3, 4);
        if (animationFrame % 30 < 15) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.fillRect(slot.x + 24, deskY + 3 - (animationFrame % 6), 2, 2);
        }
      } else {
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(slot.x + 22, deskY + 7, 6, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(slot.x + 23, deskY + 9, 4, 2);
      }
    }

    // 6. LAYER 5: Draw Executive Desk Nameplate for each seated agent
    for (let s = 0; s < bench.slots.length; s++) {
      const slot = bench.slots[s];
      const slotIndex = slot.slotIndex;
      const agentHere = agents.find(a => a.room === 'work' && a.slot === slotIndex);
      if (agentHere) {
        spriteRenderer.drawDeskNameplate(slot.x, deskY + deskH - 6, agentHere);
      }
    }
  }
}

/**
 * Update dynamic walking paths and positions for desk visits
 */
function updateVisitAnimations() {
  const activeVisitorNames = new Set((visits || []).map(v => v.visitorName.toLowerCase()));
  for (const name of visitAnims.keys()) {
    if (!activeVisitorNames.has(name)) {
      visitAnims.delete(name);
    }
  }

  for (const v of (visits || [])) {
    const vName = v.visitorName.toLowerCase();
    const visitorAgent = agents.find(a => a.name.toLowerCase() === vName);
    const targetAgent = agents.find(a => a.name.toLowerCase() === v.targetName.toLowerCase());
    if (!visitorAgent || !targetAgent) continue;

    let anim = visitAnims.get(vName);
    if (!anim) {
      // Calculate visitor home slot
      const vBenchIdx = Math.max(0, Math.min(4, Math.floor(visitorAgent.slot / 8)));
      const vSeatIdx = visitorAgent.slot % 8;
      const vBench = OFFICE_LAYOUT.workRoom.benches[vBenchIdx];
      const vSlot = vBench.slots[vSeatIdx] || vBench.slots[0];
      const homeX = vSlot.x;
      const homeY = vSlot.y;
      const homeAisleY = vBench.y + 36;

      // Calculate target slot
      const tBenchIdx = Math.max(0, Math.min(4, Math.floor(targetAgent.slot / 8)));
      const tSeatIdx = targetAgent.slot % 8;
      const tBench = OFFICE_LAYOUT.workRoom.benches[tBenchIdx];
      const tSlot = tBench.slots[tSeatIdx] || tBench.slots[0];
      const targetSlotX = tSlot.x;
      const targetSlotY = tSlot.y;
      const targetAisleY = tBench.y + 36;

      // Stand beside colleague's desk (28px spacing)
      const destX = (tSeatIdx < 7) ? targetSlotX + 28 : targetSlotX - 28;
      const destY = targetSlotY;


      let forwardWaypoints = [];
      if (vBenchIdx === tBenchIdx) {
        forwardWaypoints = [
          { x: homeX, y: homeAisleY },
          { x: destX, y: homeAisleY },
          { x: destX, y: destY }
        ];
      } else {
        const hallwayX = (Math.abs(homeX - 45) + Math.abs(destX - 45) < Math.abs(homeX - 655) + Math.abs(destX - 655)) ? 45 : 655;
        forwardWaypoints = [
          { x: homeX, y: homeAisleY },
          { x: hallwayX, y: homeAisleY },
          { x: hallwayX, y: targetAisleY },
          { x: destX, y: targetAisleY },
          { x: destX, y: destY }
        ];
      }

      const returnWaypoints = [...forwardWaypoints].reverse();
      returnWaypoints.push({ x: homeX, y: homeY });

      anim = {
        x: homeX,
        y: homeY,
        forwardWaypoints,
        returnWaypoints,
        wpIdx: 0,
        facing: 1,
        serverPhase: v.phase,
        destX,
        destY,
        homeX,
        homeY,
        targetSlotX
      };
      visitAnims.set(vName, anim);
    }

    anim.serverPhase = v.phase;

    if (v.phase === 'talking') {
      anim.x = anim.destX;
      anim.y = anim.destY;
      anim.facing = (anim.targetSlotX >= anim.x) ? 1 : -1;
    } else {
      const activeWps = (v.phase === 'returning') ? anim.returnWaypoints : anim.forwardWaypoints;
      if (anim.wpIdx < activeWps.length) {
        const targetWp = activeWps[anim.wpIdx];
        const dx = targetWp.x - anim.x;
        const dy = targetWp.y - anim.y;
        const dist = Math.hypot(dx, dy);
        const speed = 2.4;

        if (dist <= speed) {
          anim.x = targetWp.x;
          anim.y = targetWp.y;
          anim.wpIdx++;
        } else {
          anim.x += (dx / dist) * speed;
          anim.y += (dy / dist) * speed;
          if (Math.abs(dx) > 0.5) {
            anim.facing = (dx >= 0) ? 1 : -1;
          }
        }
      }
    }
  }
}

/**
 * Draw visiting agents walking along aisles or standing beside colleagues' desks
 */
function drawVisitingAgents() {
  for (const [name, anim] of visitAnims.entries()) {
    const agent = agents.find(a => a.name.toLowerCase() === name);
    if (!agent) continue;

    const renderStatus = (anim.serverPhase === 'talking') ? 'visiting' : 'walking';
    const renderAgent = {
      ...agent,
      status: renderStatus,
      facing: anim.facing
    };

    spriteRenderer.drawCharacter(anim.x, anim.y, renderAgent, animationFrame);
  }
}

/**
 * Draw 5 Conference Rooms
 */

function drawMeetingRooms() {
  const rooms = OFFICE_LAYOUT.meetingRooms;

  // Header Title
  ctx.save();
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillStyle = '#ffbb00';
  ctx.textAlign = 'left';
  ctx.fillText('📋 5 CONFERENCE SUITES (MATH & PHYSICS: Σ, Δ, λ, Ω, ∞)', 785, 25);

  // If there are meetings in waiting queue, show stylish cyber queue ticker
  if (meetingQueue && meetingQueue.length > 0) {
    const qCount = meetingQueue.length;
    const pulse = (Math.floor(animationFrame / 20) % 2 === 0);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
    ctx.fillRect(1180, 10, 240, 22);
    ctx.strokeStyle = pulse ? '#f59e0b' : '#b45309';
    ctx.lineWidth = 1;
    ctx.strokeRect(1180, 10, 240, 22);

    ctx.font = 'bold 7px "Silkscreen", monospace';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`⏳ QUEUE ACTIVE (${qCount} WAITING)`, 1188, 21);

    const firstQ = meetingQueue[0];
    const targetRoomStr = firstQ.targetRoomId ? `RM ${firstQ.targetRoomId}` : 'NEXT FREE';
    ctx.font = '6px "Silkscreen", monospace';
    ctx.fillStyle = '#fef08a';
    ctx.textAlign = 'right';
    ctx.fillText(`NEXT: ${targetRoomStr}`, 1412, 21);
  }
  ctx.restore();

  for (let rId = 1; rId <= 5; rId++) {
    const room = rooms[rId];
    drawSingleMeetingRoom(rId, room);
  }
}

/**
 * Render a Single Meeting Room
 */
function drawSingleMeetingRoom(rId, room) {
  const isBoardroom = (rId === 5);
  const roomAgents = agents.filter(a => a.room === 'meeting' && (a.meetingRoomId === rId || (!a.meetingRoomId && rId === 1)));
  const isOccupied = roomAgents.length > 0;
  const isFull = roomAgents.length >= 8;
  const topic = meetingTopics[rId] || (isOccupied ? (room.name || `Meeting Room ${rId}`) : 'AVAILABLE');

  // Check if any meetings in queue are targeting this room
  const waitingForThisRoom = (meetingQueue || []).filter(q => q.targetRoomId === rId);

  ctx.save();

  // Carpet Area
  ctx.fillStyle = isBoardroom ? '#162032' : '#0d1f2d';
  ctx.fillRect(room.x, room.y, room.w, room.h);

  // Glass Wall Border (Red if Full, Amber if In Use, Slate if Free)
  ctx.strokeStyle = isFull ? '#ef4444' : isOccupied ? '#f59e0b' : '#334155';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(room.x, room.y, room.w, room.h);

  // Top Room Header Bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(room.x, room.y, room.w, 24);
  ctx.strokeStyle = isFull ? '#991b1b' : '#475569';
  ctx.lineWidth = 1;
  ctx.strokeRect(room.x, room.y, room.w, 24);

  // Status LED (Green = Available, Amber = In Use, Pulsing Red = Full 8/8)
  const pulseRed = isFull && (Math.floor(animationFrame / 20) % 2 === 0);
  const ledColor = isFull ? (pulseRed ? '#ef4444' : '#b91c1c') : isOccupied ? '#f59e0b' : '#22c55e';
  ctx.fillStyle = ledColor;
  ctx.shadowColor = ledColor;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(room.x + 12, room.y + 12, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Room Name
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(room.name, room.x + 22, room.y + 12.5);

  // Capacity Badge [8/8 FULL] or [X/8] or [0/8 FREE]
  ctx.font = 'bold 6px "Silkscreen", monospace';
  const capText = isFull ? '[8/8 FULL]' : isOccupied ? `[${roomAgents.length}/8]` : '[0/8 FREE]';
  ctx.fillStyle = isFull ? '#ef4444' : isOccupied ? '#fbbf24' : '#22c55e';
  const capX = isBoardroom ? (room.x + 205) : (room.x + 100);
  ctx.fillText(capText, capX, room.y + 12.5);

  // Queue indicator if agents are waiting specifically for this room
  let topicOffset = isBoardroom ? 260 : 150;
  if (waitingForThisRoom.length > 0) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`⏳ Q:${waitingForThisRoom.length}`, room.x + topicOffset, room.y + 12.5);
    topicOffset += 38;
  }

  // Subtitle / Topic banner (neatly truncated so it never overflows)
  const maxChars = isBoardroom ? 45 : (waitingForThisRoom.length > 0 ? 12 : 18);
  const displayTopic = topic.length > maxChars ? topic.substring(0, maxChars - 2) + '..' : topic;
  ctx.font = '7px "Silkscreen", monospace';
  ctx.fillStyle = isOccupied ? '#94a3b8' : '#64748b';
  ctx.fillText(`// ${displayTopic}`, room.x + topicOffset, room.y + 12.5);

  // Rotate active speaker every 2.5 seconds (150 frames) so only one speaks at a time
  if (roomAgents.length > 0) {
    const speakerIdx = Math.floor(animationFrame / 150) % roomAgents.length;
    roomAgents.forEach((a, idx) => {
      a.isSpeaking = (idx === speakerIdx);
    });
  }


  // 1. Draw Top Chairs (behind the table)
  const half = Math.ceil(room.slots.length / 2);
  for (let s = 0; s < half; s++) {
    const slot = room.slots[s];
    const agentHere = roomAgents.find(a => a.slot === s);
    spriteRenderer.drawChair(slot.x, slot.y);
    if (agentHere) {
      spriteRenderer.drawCharacter(slot.x, slot.y, agentHere, animationFrame);
    }
  }

  // 2. Draw Meeting Table
  // Soft Table Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(room.tableX, room.tableY + 5, room.tableW / 2 + 4, room.tableH / 2 + 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Conference Table Surface (Rich Walnut / Mahogany)
  ctx.fillStyle = isBoardroom ? '#831843' : '#7c2d12';
  ctx.beginPath();
  ctx.ellipse(room.tableX, room.tableY, room.tableW / 2, room.tableH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bevel / Highlight
  ctx.fillStyle = isBoardroom ? '#9d174d' : '#9a3412';
  ctx.beginPath();
  ctx.ellipse(room.tableX, room.tableY - 2, room.tableW / 2 - 5, room.tableH / 2 - 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Center Microphone / Presentation console
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(room.tableX - 18, room.tableY - 7, 36, 14);
  ctx.fillStyle = isOccupied ? '#22c55e' : '#64748b';
  ctx.fillRect(room.tableX - 3, room.tableY - 3, 6, 6);

  // Table Place Cards for Top Row Agents (Sitting behind table)
  for (let s = 0; s < half; s++) {
    const slot = room.slots[s];
    const agentHere = roomAgents.find(a => a.slot === s);
    if (agentHere) {
      spriteRenderer.drawMeetingNameBadge(slot.x, room.tableY - 12, agentHere);
    }
  }

  // Table Place Cards for Bottom Row Agents (On Table)
  for (let s = half; s < room.slots.length; s++) {
    const slot = room.slots[s];
    const agentHere = roomAgents.find(a => a.slot === s);
    if (agentHere) {
      spriteRenderer.drawMeetingNameBadge(slot.x, room.tableY + 3, agentHere);
    }
  }

  // 3. Draw Bottom Chairs (in front of table)
  for (let s = half; s < room.slots.length; s++) {
    const slot = room.slots[s];
    const agentHere = roomAgents.find(a => a.slot === s);
    spriteRenderer.drawChair(slot.x, slot.y);
    if (agentHere) {
      spriteRenderer.drawCharacter(slot.x, slot.y, agentHere, animationFrame);
    }
  }

  ctx.restore();
}

/**
 * ANIMATION LOOP (Normalized 60 FPS baseline regardless of monitor refresh rate)
 */
let lastTime = performance.now();
const FRAME_DURATION = 1000 / 60; // ~16.6ms

function loop(currentTime) {
  if (!currentTime) currentTime = performance.now();
  const delta = currentTime - lastTime;

  if (delta >= FRAME_DURATION) {
    const framesToAdvance = Math.min(Math.floor(delta / FRAME_DURATION), 3);
    animationFrame += framesToAdvance;
    lastTime = currentTime - (delta % FRAME_DURATION);

    updateVisitAnimations();
    drawOffice();

    // Update & Draw Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.update()) {
        p.draw(ctx);
      } else {
        particles.splice(i, 1);
      }
    }
  }

  requestAnimationFrame(loop);
}

/**
 * WEBSOCKET & STATE SYNCHRONIZATION
 */
let socket = null;
let reconnectDelay = 1000;

function updateSessionDropdown(sessionsList) {
  knownSessions = sessionsList || [];
  const select = document.getElementById('session-select');
  if (!select) return;

  select.innerHTML = '';
  for (const s of knownSessions) {
    const opt = document.createElement('option');
    opt.value = s.id;
    const isCurrent = s.id === currentSessionId;
    opt.textContent = `${s.name} (${s.agentCount}👥 · ${s.sprintPhase.toUpperCase()})`;
    if (isCurrent) {
      opt.selected = true;
    }
    select.appendChild(opt);
  }

  // If currentSessionId is not in list, add it
  if (!knownSessions.some(s => s.id === currentSessionId)) {
    const opt = document.createElement('option');
    opt.value = currentSessionId;
    opt.textContent = `${currentSessionId} (active)`;
    opt.selected = true;
    select.appendChild(opt);
  }
  select.value = currentSessionId;
}

window.onSessionSelectChange = function(newSessionId) {
  window.switchSession(newSessionId);
};

window.switchSession = function(newSessionId) {
  if (!newSessionId) return;
  currentSessionId = newSessionId;
  localStorage.setItem('agent_hq_session', newSessionId);

  // Update browser URL query param without reload
  const newUrl = new URL(window.location);
  newUrl.searchParams.set('session', newSessionId);
  window.history.replaceState({}, '', newUrl);

  const select = document.getElementById('session-select');
  if (select) select.value = newSessionId;

  // Inform WebSocket server
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'SWITCH_SESSION', session: newSessionId }));
  }

  // Load new session state
  fetchSessionState(newSessionId);
};

async function fetchSessionState(sessionId) {
  try {
    const res = await fetch(`/api/agents?session=${encodeURIComponent(sessionId)}`);
    if (res.ok) {
      const data = await res.json();
      agents = data.agents || [];
      meetingTopics = data.meetingTopics || {};
      meetingQueue = data.meetingQueue || [];
      visits = data.visits || [];
      if (data.sprint) {
        currentSprint = data.sprint;
      }
      updateHUD();
      updateSprintHUD();
    }
  } catch (err) {
    console.error('Failed to load session state:', err);
  }
}

window.promptNewSession = function() {
  const name = prompt('Enter project directory name to view or create (e.g. "my-project", "ecommerce-backend"):');
  if (name && name.trim()) {
    const clean = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: clean })
    })
      .then(r => r.json())
      .then(data => {
        if (data.session) {
          window.switchSession(data.session);
          if (Array.isArray(data.sessions)) {
            updateSessionDropdown(data.sessions);
          }
        }
      })
      .catch(err => {
        console.error('Failed to create session:', err);
      });
  }
};

window.promptResetSession = function() {
  if (confirm(`Reset session "${currentSessionId}"? All agents and sprint state in this session will be cleared.`)) {
    fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}/reset`, { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        fetchSessionState(currentSessionId);
      })
      .catch(err => console.error('Failed to reset session:', err));
  }
};

window.promptDeleteSession = function() {
  if (knownSessions.length <= 1) {
    alert('Cannot delete the only remaining session.');
    return;
  }
  if (confirm(`Delete session "${currentSessionId}"? This cannot be undone.`)) {
    fetch(`/api/sessions/${encodeURIComponent(currentSessionId)}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(data => {
        const remaining = data.sessions || [];
        if (remaining.length > 0) {
          window.switchSession(remaining[0].id);
        }
      })
      .catch(err => console.error('Failed to delete session:', err));
  }
};

async function fetchSessionsList() {
  try {
    const res = await fetch('/api/sessions');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.sessions)) {
        updateSessionDropdown(data.sessions);
      }
    }
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
  }
}

function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}?session=${encodeURIComponent(currentSessionId)}`;
  socket = new WebSocket(wsUrl);

  const statusEl = document.getElementById('ws-status');

  socket.onopen = () => {
    statusEl.textContent = 'ONLINE';
    statusEl.className = 'status-indicator connected';
    reconnectDelay = 1000;
    fetchSessionsList();
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'SESSIONS_UPDATE') {
        if (Array.isArray(data.payload)) {
          updateSessionDropdown(data.payload);
        }
        return;
      }

      if (data.type === 'INIT' || data.type === 'STATE_UPDATE') {
        if (data.session && data.type === 'INIT') {
          currentSessionId = data.session;
          localStorage.setItem('agent_hq_session', data.session);
        }
        if (Array.isArray(data.sessions)) {
          updateSessionDropdown(data.sessions);
        }

        // Only update office canvas if this message matches the currently active session
        if (!data.session || data.session === currentSessionId) {
          const prevAgents = [...agents];
          agents = data.payload.agents || [];
          meetingTopics = data.payload.meetingTopics || {};
          meetingQueue = data.payload.meetingQueue || [];
          visits = data.payload.visits || [];
          if (data.payload.sprint) {
            currentSprint = data.payload.sprint;
          }
          updateHUD();
          updateSprintHUD();

          // Check if any agent disappeared -> spawn poof particle at chair position!
          for (const oldA of prevAgents) {
            if (!agents.find(a => a.name === oldA.name)) {
              let px = 500, py = 350;
              if (oldA.room === 'meeting') {
                const rId = oldA.meetingRoomId || 1;
                const room = OFFICE_LAYOUT.meetingRooms[rId];
                if (room) {
                  const slot = room.slots[oldA.slot % room.slots.length];
                  px = slot ? slot.x : room.tableX;
                  py = slot ? slot.y : room.tableY;
                }
              } else {
                const bIdx = Math.floor(oldA.slot / 8);
                const sIdx = oldA.slot % 8;
                const bench = OFFICE_LAYOUT.workRoom.benches[bIdx] || OFFICE_LAYOUT.workRoom.benches[0];
                const slot = bench.slots[sIdx] || bench.slots[0];
                px = slot.x;
                py = slot.y;
              }
              spawnPoof(px, py);
            }
          }
        }
      } else if (data.type === 'AGENT_EVENT') {
        if (!data.session || data.session === currentSessionId) {
          const ev = data.payload;
          if (ev.event === 'spawn') {
            window.soundSystem.playSpawn();
          } else if (ev.event === 'sleep') {
            window.soundSystem.playSleep();
          } else if (ev.event === 'talk') {
            window.soundSystem.playTalk();
          } else if (ev.event === 'walk') {
            window.soundSystem.playSpawn();
          }
        }
      }
    } catch (e) {
      console.error('Error handling WS message:', e);
    }
  };

  socket.onclose = () => {
    statusEl.textContent = 'RECONNECTING';
    statusEl.className = 'status-indicator disconnected';
    setTimeout(connectWS, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
  };

  socket.onerror = () => {
    socket.close();
  };
}

function updateHUD() {
  const countEl = document.getElementById('agent-count');
  const roomStatsEl = document.getElementById('room-stats');
  const tickerEl = document.getElementById('ticker-items');

  const workingAgents = agents.filter(a => a.status === 'working');
  const workingCount = workingAgents.length;
  const sleepingCount = agents.filter(a => a.status === 'sleeping').length;
  const meetCount = agents.filter(a => a.room === 'meeting').length;
  const waitingCount = agents.filter(a => a.status === 'waiting').length;
  const qCount = (meetingQueue || []).length;

  countEl.textContent = `${agents.length} AGENT${agents.length === 1 ? '' : 'S'} (${workingCount} WORKING)`;
  const qStats = qCount > 0 ? ` · ⏳ QUEUED: ${qCount} (${waitingCount} AGENTS)` : '';
  roomStatsEl.textContent = `💻 WORKING: ${workingCount} · 💤 SLEEPING: ${sleepingCount} · 📋 IN MEETINGS: ${meetCount}${qStats} · TOTAL: ${agents.length}`;

  if (tickerEl) {
    if (workingAgents.length === 0) {
      tickerEl.innerHTML = `<span class="ticker-item">No active tasks · All agents idle or resting</span>`;
    } else {
      tickerEl.innerHTML = workingAgents.map(a => {
        const prog = a.progress !== undefined ? a.progress : 25;
        const task = a.message || 'Coding';
        return `<span class="ticker-item"><strong>[${a.name}]</strong> ${task} <span class="ticker-prog">${prog}%</span></span>`;
      }).join('');
    }
  }
}

function updateSprintHUD() {
  if (!currentSprint) return;
  const badge = document.getElementById('sprint-badge');
  const story = document.getElementById('sprint-story');
  const pts = document.getElementById('sprint-pts');
  const completeBtn = document.getElementById('sprint-complete-btn');
  const nextBtn = document.getElementById('sprint-next-btn');

  const isCompleted = currentSprint.phase === 'completed';
  if (badge) {
    if (isCompleted) {
      badge.textContent = `🏆 SPRINT #${currentSprint.sprintNumber} COMPLETED`;
      badge.style.background = '#eab308';
      badge.style.color = '#000';
    } else {
      badge.textContent = `🏃 SPRINT #${currentSprint.sprintNumber}`;
      badge.style.background = '#2563eb';
      badge.style.color = '#fff';
    }
  }
  if (story) story.textContent = currentSprint.story;
  if (pts) pts.textContent = `${currentSprint.storyPoints || 5} PTS`;

  if (completeBtn) {
    completeBtn.style.display = (currentSprint.phase === 'retro' || currentSprint.phaseIndex === 8) ? 'inline-block' : 'none';
  }
  if (nextBtn) {
    nextBtn.style.display = isCompleted ? 'none' : 'inline-block';
  }

  const cardSrcBadge = document.getElementById('sprint-card-source');
  if (cardSrcBadge) {
    if (currentSprint.sourceCard) {
      const src = currentSprint.sourceCard.source || 'tw';
      cardSrcBadge.style.display = 'inline-block';
      if (src === 'jira') {
        cardSrcBadge.textContent = `[JIRA: ${currentSprint.sourceCard.id}]`;
        cardSrcBadge.style.background = '#0284c7';
      } else {
        cardSrcBadge.textContent = `[TW: #${currentSprint.sourceCard.id}]`;
        cardSrcBadge.style.background = '#10b981';
      }
    } else {
      cardSrcBadge.style.display = 'none';
    }
  }

  const steps = document.querySelectorAll('.c-step');
  steps.forEach(step => {
    const sIndex = parseInt(step.getAttribute('data-step'), 10);
    if (isCompleted || sIndex < currentSprint.phaseIndex) {
      step.className = 'c-step completed';
    } else if (sIndex === currentSprint.phaseIndex) {
      step.className = 'c-step active';
    } else {
      step.className = 'c-step';
    }
  });
}

let activeCardSource = 'taskwarrior';

window.toggleCardsModal = function() {
  const modal = document.getElementById('cards-modal');
  if (modal) {
    const isHidden = (modal.style.display === 'none' || !modal.style.display);
    modal.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) {
      loadCards(activeCardSource);
    }
  }
};

window.switchCardSource = function(src) {
  activeCardSource = src;
  const tabTw = document.getElementById('tab-tw');
  const tabJira = document.getElementById('tab-jira');
  if (tabTw && tabJira) {
    if (src === 'jira') {
      tabJira.classList.add('active');
      tabTw.classList.remove('active');
    } else {
      tabTw.classList.add('active');
      tabJira.classList.remove('active');
    }
  }
  loadCards(src);
};

window.loadCards = async function(src) {
  const container = document.getElementById('cards-list-container');
  if (!container) return;
  container.innerHTML = `<div style="color:#94a3b8; font-size:12px; text-align:center; padding:15px;">Loading ${src.toUpperCase()} backlog...</div>`;

  try {
    const res = await apiFetch(`/api/cards?source=${src}`);
    const data = await res.json();
    if (!data.success || !data.cards || data.cards.length === 0) {
      container.innerHTML = `<div style="color:#94a3b8; font-size:12px; text-align:center; padding:15px;">No cards found in ${src.toUpperCase()} backlog.</div>`;
      return;
    }

    container.innerHTML = data.cards.map(c => {
      const isDone = c.status === 'done';
      const isProg = c.status === 'in_progress';
      const statusBadge = isDone
        ? `<span style="background:#22c55e; color:#000; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold;">DONE</span>`
        : isProg
        ? `<span style="background:#38bdf8; color:#000; padding:2px 6px; border-radius:3px; font-size:10px; font-weight:bold;">IN PROG</span>`
        : `<span style="background:#64748b; color:#fff; padding:2px 6px; border-radius:3px; font-size:10px;">TODO</span>`;

      const tagsHtml = (c.tags && c.tags.length > 0)
        ? c.tags.map(t => `<span style="background:#334155; color:#93c5fd; padding:1px 5px; border-radius:2px; font-size:10px; margin-right:3px;">#${t}</span>`).join('')
        : '';

      const priHtml = c.priority
        ? `<span style="color:#f59e0b; font-size:11px; margin-right:6px;">[Pri: ${c.priority}]</span>`
        : '';

      return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:6px 8px; border-bottom:1px solid #1e293b; font-size:12px;">
          <div style="flex:1; margin-right:10px;">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              <span style="color:#38bdf8; font-family:monospace; font-weight:bold;">#${c.id}</span>
              ${statusBadge}
              <span style="color:#e2e8f0; font-weight:500;">${c.title}</span>
            </div>
            <div style="display:flex; align-items:center; font-size:11px; color:#94a3b8;">
              <span style="margin-right:8px; color:#cbd5e1;">🎯 ${c.points !== undefined ? c.points : 5} pts</span>
              ${priHtml}
              ${tagsHtml}
            </div>
          </div>
          <div>
            <button class="retro-btn" onclick="startSprintWithCard('${c.id}', '${src}')" style="font-size:11px; padding:3px 8px; background:#2563eb; color:#fff;" ${isDone ? 'disabled style="opacity:0.5;"' : ''}>
              ▶️ Start Sprint
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444; font-size:12px; text-align:center; padding:15px;">Failed to load cards: ${err.message}</div>`;
  }
};

window.startSprintWithCard = async function(cardId, source) {
  try {
    const res = await apiFetch('/api/sprint/start', {
      method: 'POST',
      body: JSON.stringify({ cardId, source })
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    if (data.sprint) {
      currentSprint = data.sprint;
      updateSprintHUD();
      toggleCardsModal();
      if (window.soundSystem) window.soundSystem.playSpawn();
    }
  } catch (err) {
    alert(`Failed to start sprint: ${err.message}`);
  }
};

window.submitNewCard = async function() {
  const titleInput = document.getElementById('new-card-title');
  const ptsInput = document.getElementById('new-card-pts');
  const priSelect = document.getElementById('new-card-pri');
  if (!titleInput || !titleInput.value.trim()) {
    alert('Please enter a story card title');
    return;
  }

  const title = titleInput.value.trim();
  const points = parseInt(ptsInput.value, 10) || 5;
  const priority = priSelect.value || 'M';

  try {
    const res = await apiFetch('/api/cards/add', {
      method: 'POST',
      body: JSON.stringify({ title, points, priority, source: 'taskwarrior' })
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    titleInput.value = '';
    loadCards(activeCardSource);
  } catch (err) {
    alert(`Failed to add card: ${err.message}`);
  }
};

window.quickSprintNext = async function() {
  try {
    const res = await apiFetch('/api/sprint/next', {
      method: 'POST'
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    if (data.sprint) {
      currentSprint = data.sprint;
      updateSprintHUD();
      if (window.soundSystem) window.soundSystem.playSpawn();
    }
  } catch (e) {
    console.error('Failed to advance sprint:', e);
  }
};

window.quickSprintComplete = async function() {
  try {
    const res = await apiFetch('/api/sprint/complete', {
      method: 'POST'
    });
    const data = await res.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    if (data.sprint) {
      currentSprint = data.sprint;
      updateSprintHUD();
      if (window.soundSystem) window.soundSystem.playSpawn();
    }
  } catch (e) {
    console.error('Failed to complete sprint:', e);
  }
};

window.quickSprintStartPrompt = async function() {
  const isCompleted = currentSprint && currentSprint.phase === 'completed';
  const defaultNum = (currentSprint ? currentSprint.sprintNumber : 0) + (isCompleted ? 1 : 1);
  const story = prompt(`Enter story card for Sprint #${defaultNum}:`, `AUTH-${defaultNum}01: Continuous Milestone Increment #${defaultNum}`);
  if (!story) return;

  const ptsStr = prompt(`Story Points estimation for "${story}":`, '8');
  const points = parseInt(ptsStr, 10) || 5;

  try {
    const res = await apiFetch('/api/sprint/start', {
      method: 'POST',
      body: JSON.stringify({ sprintNumber: defaultNum, story, points })
    });
    const data = await res.json();
    if (data.sprint) {
      currentSprint = data.sprint;
      updateSprintHUD();
      if (window.soundSystem) window.soundSystem.playSpawn();
    }
  } catch (e) {
    console.error('Failed to start sprint:', e);
  }
};


/**
 * QUICK ACTION BUTTONS
 */
async function quickAction(type, arg) {
  try {
    if (type === 'spawn') {
      await apiFetch('/api/agents/spawn', {
        method: 'POST',
        body: JSON.stringify({ role: arg || 'dev', status: 'working' })
      });
    } else if (type === 'spawn-team') {
      // Spawn 8 devs to fill a startup bench
      for (let i = 0; i < 8; i++) {
        await apiFetch('/api/agents/spawn', {
          method: 'POST',
          body: JSON.stringify({ role: 'dev', status: 'working' })
        });
      }
    } else if (type === 'spawn-potato') {
      await apiFetch('/api/potato-agents/spawn-squad', {
        method: 'POST'
      });
    } else if (type === 'work-all') {
      for (const a of agents) {
        await apiFetch('/api/agents/work', {
          method: 'POST',
          body: JSON.stringify({ name: a.name, task: 'Refactoring codebase' })
        });
      }
    } else if (type === 'sleep-all') {
      for (const a of agents) {
        await apiFetch('/api/agents/sleep', {
          method: 'POST',
          body: JSON.stringify({ name: a.name })
        });
      }
    } else if (type === 'reset') {
      await apiFetch('/api/reset', {
        method: 'POST'
      });
    }
  } catch (err) {
    console.error('Quick action failed:', err);
  }
}

window.quickSpawnDept = async function(dept) {
  if (!dept) return;
  try {
    const res = await apiFetch('/api/departments/spawn', {
      method: 'POST',
      body: JSON.stringify({ department: dept, count: 1 })
    });
    const data = await res.json();
    if (data.success && window.soundSystem) {
      window.soundSystem.playSpawn();
    }
  } catch (err) {
    console.error('Failed to spawn department agent:', err);
  }
};

async function quickMeetSelected() {
  if (agents.length === 0) return;
  const select = document.getElementById('room-select');
  const roomId = parseInt(select.value, 10) || 1;
  const names = agents.slice(0, 8).map(a => a.name);

  await apiFetch('/api/agents/meet', {
    method: 'POST',
    body: JSON.stringify({ names, room: roomId, topic: `Standup Room ${roomId}` })
  });
}

async function quickEndSelected() {
  const select = document.getElementById('room-select');
  const roomId = parseInt(select.value, 10) || 1;

  await apiFetch('/api/agents/end-meeting', {
    method: 'POST',
    body: JSON.stringify({ room: roomId })
  });
}

function toggleGallery() {
  const modal = document.getElementById('assets-modal');
  if (modal) {
    modal.style.display = (modal.style.display === 'none' || !modal.style.display) ? 'flex' : 'none';
  }
}

// Canvas Zoom & Responsive Fit
function setCanvasZoom(mode) {
  const canvasEl = document.getElementById('office-canvas');
  if (!canvasEl) return;

  if (mode === 'fit') {
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.maxWidth = '100%';
    canvasEl.style.maxHeight = '100%';
  } else {
    const scale = parseInt(mode, 10) / 100;
    canvasEl.style.width = Math.round(1440 * scale) + 'px';
    canvasEl.style.height = Math.round(850 * scale) + 'px';
    canvasEl.style.maxWidth = 'none';
    canvasEl.style.maxHeight = 'none';
  }
  try {
    localStorage.setItem('agent_hq_zoom', mode);
  } catch (e) {}
}

// Restore saved zoom level
try {
  const savedZoom = localStorage.getItem('agent_hq_zoom');
  if (savedZoom) {
    const zoomSelect = document.getElementById('zoom-select');
    if (zoomSelect) {
      zoomSelect.value = savedZoom;
      setCanvasZoom(savedZoom);
    }
  }
} catch (e) {}

// Sound toggle button
const soundBtn = document.getElementById('sound-toggle');
soundBtn.addEventListener('click', () => {
  const isMuted = !window.soundSystem.toggleMute();
  soundBtn.textContent = isMuted ? '🔇 SFX: OFF' : '🔊 SFX: ON';
});

// Canvas click sound unlock (browser audio policy)
canvas.addEventListener('click', () => {
  window.soundSystem.init();
});

// START
connectWS();
loop();
