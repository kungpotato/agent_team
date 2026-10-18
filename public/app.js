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
let animationFrame = 0;
let particles = [];



// BENCH CONFIGURATION (5 Long Desks x 8 seats = 40 workstations)
// Generous vertical spacing & zero collision with wall decor or rows above
const BENCHES = [
  { name: 'BENCH 1 // CORE TECH',     y: 195 },
  { name: 'BENCH 2 // FRONTEND & UI', y: 325 },
  { name: 'BENCH 3 // BACKEND & API', y: 455 },
  { name: 'BENCH 4 // AI & DATA',     y: 585 },
  { name: 'BENCH 5 // DEVOPS & INFRA',y: 725 }
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
      name: 'ROOM 1',
      subtitle: 'Alpha Suite (8 Seats)',
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
      name: 'ROOM 2',
      subtitle: 'Beta Suite (8 Seats)',
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
      name: 'ROOM 3',
      subtitle: 'Gamma Suite (8 Seats)',
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
      name: 'ROOM 4',
      subtitle: 'Delta Suite (8 Seats)',
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
      name: 'ROOM 5',
      subtitle: 'Executive Boardroom (8 Seats)',
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

    // 1. Bench Name Sign in the open walkway margin to the left (x: 8..31, clear of all seats & chairs!)
    ctx.save();
    ctx.fillStyle = '#090d16';
    ctx.fillRect(8, deskY - 12, 23, 22);
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(8, deskY - 12, 23, 22);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`B${b + 1}`, 19, deskY - 8);

    const tagShort = ['TECH', 'UI', 'API', 'DATA', 'SRE'][b];
    ctx.font = '5px "Silkscreen", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(tagShort, 19, deskY + 3);
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
  ctx.fillText('📋 5 CONFERENCE ROOMS (ROOMS 1 - 5)', 785, 25);

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
  const topic = meetingTopics[rId] || (isOccupied ? `Meeting Room ${rId}` : 'AVAILABLE');

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
  ctx.fillText(capText, room.x + 80, room.y + 12.5);

  // Queue indicator if agents are waiting specifically for this room
  let topicOffset = 138;
  if (waitingForThisRoom.length > 0) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`⏳ Q:${waitingForThisRoom.length}`, room.x + 138, room.y + 12.5);
    topicOffset = 175;
  }

  // Subtitle / Topic banner (neatly truncated so it never overflows)
  const maxChars = isBoardroom ? 45 : (waitingForThisRoom.length > 0 ? 12 : 16);
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

function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  socket = new WebSocket(wsUrl);

  const statusEl = document.getElementById('ws-status');

  socket.onopen = () => {
    statusEl.textContent = 'ONLINE';
    statusEl.className = 'status-indicator connected';
    reconnectDelay = 1000;
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'INIT' || data.type === 'STATE_UPDATE') {
        const prevAgents = [...agents];
        agents = data.payload.agents || [];
        meetingTopics = data.payload.meetingTopics || {};
        meetingQueue = data.payload.meetingQueue || [];
        visits = data.payload.visits || [];
        updateHUD();

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
      } else if (data.type === 'AGENT_EVENT') {
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

/**
 * QUICK ACTION BUTTONS
 */
async function quickAction(type, arg) {
  try {
    if (type === 'spawn') {
      await fetch('/api/agents/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: arg || 'dev', status: 'working' })
      });
    } else if (type === 'spawn-team') {
      // Spawn 8 devs to fill a startup bench
      for (let i = 0; i < 8; i++) {
        await fetch('/api/agents/spawn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'dev', status: 'working' })
        });
      }
    } else if (type === 'spawn-potato') {
      await fetch('/api/potato-agents/spawn-squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } else if (type === 'work-all') {
      for (const a of agents) {
        await fetch('/api/agents/work', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: a.name, task: 'Refactoring codebase' })
        });
      }
    } else if (type === 'sleep-all') {
      for (const a of agents) {
        await fetch('/api/agents/sleep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: a.name })
        });
      }
    }
  } catch (err) {
    console.error('Quick action failed:', err);
  }
}

async function quickMeetSelected() {
  if (agents.length === 0) return;
  const select = document.getElementById('room-select');
  const roomId = parseInt(select.value, 10) || 1;
  const names = agents.slice(0, 8).map(a => a.name);

  await fetch('/api/agents/meet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names, room: roomId, topic: `Standup Room ${roomId}` })
  });
}

async function quickEndSelected() {
  const select = document.getElementById('room-select');
  const roomId = parseInt(select.value, 10) || 1;

  await fetch('/api/agents/end-meeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: roomId })
  });
}

function toggleGallery() {
  const modal = document.getElementById('assets-modal');
  if (modal) {
    modal.style.display = (modal.style.display === 'none' || !modal.style.display) ? 'flex' : 'none';
  }
}

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
