/**
 * 8-Bit Pixel Art Drawing Primitives and Sprites
 */

// Color palettes for characters (Maps 1:1 to Potato-Skill Agent Colors)
const PALETTES = [
  { name: 'cyan',    shirt: '#00d2d3', hair: '#222f3e', skin: '#ffdbac', pants: '#341f97' }, // 0: devops-release
  { name: 'green',   shirt: '#10ac84', hair: '#ee5253', skin: '#f1c27d', pants: '#222f3e' }, // 1: project-planner
  { name: 'orange',  shirt: '#ff9f43', hair: '#576574', skin: '#ffdbac', pants: '#2c2c54' }, // 2: coder
  { name: 'purple',  shirt: '#8e44ad', hair: '#feca57', skin: '#e0ac69', pants: '#1e272e' }, // 3: product-manager
  { name: 'pink',    shirt: '#ff6b6b', hair: '#48dbfb', skin: '#ffdbac', pants: '#222f3e' }, // 4: runtime-sre
  { name: 'blue',    shirt: '#2e86de', hair: '#333333', skin: '#f1c27d', pants: '#576574' }, // 5: system-architect
  { name: 'yellow',  shirt: '#f1c40f', hair: '#1dd1a1', skin: '#c68642', pants: '#222f3e' }, // 6: qa-tester
  { name: 'teal',    shirt: '#00cec9', hair: '#8395a7', skin: '#ffdbac', pants: '#10ac84' }, // 7: design-to-code
  { name: 'red',     shirt: '#e74c3c', hair: '#2d3436', skin: '#ffdbac', pants: '#2d3436' }, // 8: code-reviewer
];

/**
 * Smart agent label formatter:
 * Returns clear, human-readable identity without truncating into confusing dots.
 */
function getAgentLabel(name) {
  if (!name) return 'agent';
  const clean = name.toLowerCase();
  if (clean.startsWith('code-reviewer')) return clean.replace('code-reviewer', 'reviewer');
  if (clean.startsWith('system-architect')) return clean.replace('system-architect', 'arch');
  if (clean.startsWith('product-manager')) return clean.replace('product-manager', 'pm');
  if (clean.startsWith('project-planner')) return clean.replace('project-planner', 'planner');
  if (clean.startsWith('ui-ux-designer')) return clean.replace('ui-ux-designer', 'ui-ux');
  if (clean.startsWith('design-to-code')) return clean.replace('design-to-code', 'ui-dev');
  if (clean.startsWith('devops-release')) return clean.replace('devops-release', 'devops');
  if (clean.startsWith('runtime-sre')) return clean.replace('runtime-sre', 'sre');
  if (clean.startsWith('engineering-manager')) return clean.replace('engineering-manager', 'em');
  return name;
}

class SpriteRenderer {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Draw a pixel rectangle
  pixelRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  /**
   * Draw an 8-bit Character
   * @param {number} x Screen X center
   * @param {number} y Screen Y base
   * @param {object} agent Agent state
   * @param {number} frame Current animation frame counter
   */
  drawCharacter(x, y, agent, frame) {
    const ctx = this.ctx;
    const palette = PALETTES[agent.colorIndex % PALETTES.length];
    const p = 2.4; // pixel scale factor (compacted to provide extra room for task box)

    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y));

    const isWalking = (agent.status === 'walking');
    const isVisiting = (agent.status === 'visiting');

    // Torso breathing/posture
    let torsoBobY = 0;
    let headBobY = 0;

    if (isWalking) {
      // Walking cycle: alternating legs and swinging arms
      const walkCycle = Math.floor(frame / 6) % 4;
      const legOffset = (walkCycle === 0) ? -2 : (walkCycle === 2) ? 2 : 0;
      this.pixelRect(-5 * p, -4 * p, 4 * p, (7 - legOffset) * p, palette.pants);
      this.pixelRect(1 * p, -4 * p, 4 * p, (7 + legOffset) * p, palette.pants);
      // Shoes
      this.pixelRect(-5 * p, (3 - legOffset) * p, 4 * p, 2 * p, '#0f172a');
      this.pixelRect(1 * p, (3 + legOffset) * p, 4 * p, 2 * p, '#0f172a');
      headBobY = (walkCycle % 2 === 0) ? -1 : 0;
    } else if (isVisiting) {
      // Standing upright beside colleague's desk
      this.pixelRect(-5 * p, -4 * p, 4 * p, 7 * p, palette.pants);
      this.pixelRect(1 * p, -4 * p, 4 * p, 7 * p, palette.pants);
      this.pixelRect(-5 * p, 3 * p, 4 * p, 2 * p, '#0f172a');
      this.pixelRect(1 * p, 3 * p, 4 * p, 2 * p, '#0f172a');
      headBobY = (frame % 40 < 20) ? 0 : -1;
    } else {
      // SEATED CHARACTER STABILITY:
      // Legs and hips remain firmly seated on the chair
      this.pixelRect(-5 * p, -4 * p, 10 * p, 4 * p, palette.pants);

      if (agent.status === 'working') {
        headBobY = 0;
        torsoBobY = 0;
      } else if (agent.status === 'sleeping') {
        torsoBobY = Math.round(Math.sin(frame * 0.04) * 0.6);
        headBobY = 1 + torsoBobY;
      } else if (agent.status === 'talking') {
        headBobY = (frame % 40 < 20) ? 0 : -1;
        torsoBobY = 0;
      }
    }

    // Shadow on floor/chair
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shirt / Torso
    this.pixelRect(-6 * p, (-12 + torsoBobY) * p, 12 * p, 8 * p, palette.shirt);
    // Shirt collar / buttons
    this.pixelRect(-1 * p, (-12 + torsoBobY) * p, 2 * p, 4 * p, '#ffffff');

    // HEAD
    const headX = -5 * p;
    const headY = (-22 + headBobY) * p;
    // Neck
    this.pixelRect(-2 * p, (-14 + headBobY) * p, 4 * p, 2 * p, palette.skin);
    // Face
    this.pixelRect(headX, headY, 10 * p, 9 * p, palette.skin);

    // Hair
    this.pixelRect(headX - 1 * p, headY - 2 * p, 12 * p, 4 * p, palette.hair);
    this.pixelRect(headX - 1 * p, headY + 2 * p, 2 * p, 4 * p, palette.hair);
    this.pixelRect(headX + 9 * p, headY + 2 * p, 2 * p, 4 * p, palette.hair);

    // EYES & MOUTH & ARMS BASED ON STATUS
    if (isWalking) {
      // Walking eyes looking forward in movement direction
      this.pixelRect(-3 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');
      this.pixelRect(1 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');
      // Natural walking swinging arms
      const armPhase = Math.floor(frame / 6) % 4;
      const armOffset = (armPhase === 0) ? 2 : (armPhase === 2) ? -2 : 0;
      this.pixelRect(-8 * p, (-10 - armOffset) * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(5 * p, (-10 + armOffset) * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(-8 * p, (-4 - armOffset) * p, 3 * p, 2 * p, palette.skin);
      this.pixelRect(5 * p, (-4 + armOffset) * p, 3 * p, 2 * p, palette.skin);

    } else if (isVisiting) {
      // Active conversational eyes & mouth
      this.pixelRect(-3 * p, headY + 2 * p, 2 * p, 3 * p, '#1e272e');
      this.pixelRect(1 * p, headY + 2 * p, 2 * p, 3 * p, '#1e272e');
      this.pixelRect(-1 * p, headY + 6 * p, 2 * p, 2 * p, '#e74c3c');
      // Holding small consultation notepad in hand
      this.pixelRect(-7 * p, -9 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(4 * p, -10 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(4 * p, -5 * p, 5 * p, 5 * p, '#fef08a'); // notepad
      this.pixelRect(5 * p, -4 * p, 3 * p, 3 * p, '#0284c7'); // notes

    } else if (agent.status === 'working') {
      // Focused eyes
      this.pixelRect(-3 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');
      this.pixelRect(1 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');

      // Glasses or screen reflection
      ctx.fillStyle = 'rgba(0, 255, 204, 0.35)';
      ctx.fillRect(-4 * p, headY + 2 * p, 4 * p, 4 * p);
      ctx.fillRect(0 * p, headY + 2 * p, 4 * p, 4 * p);

      // Typing Arms: realistic typing cadence (not machine gun)
      const typingPhase = Math.floor(frame / 12) % 4;
      const leftHandY = (typingPhase === 0 || typingPhase === 2) ? 1 : 0;
      const rightHandY = (typingPhase === 1 || typingPhase === 3) ? 1 : 0;

      // Arms
      this.pixelRect(-8 * p, -10 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(5 * p, -10 * p, 3 * p, 6 * p, palette.shirt);
      // Hands on keyboard
      this.pixelRect(-7 * p, (-5 + leftHandY) * p, 3 * p, 2 * p, palette.skin);
      this.pixelRect(4 * p, (-5 + rightHandY) * p, 3 * p, 2 * p, palette.skin);

    } else if (agent.status === 'sleeping') {
      // Sleeping eyes (peaceful lines - -)
      this.pixelRect(-3 * p, headY + 4 * p, 3 * p, 1 * p, '#1e272e');
      this.pixelRect(1 * p, headY + 4 * p, 3 * p, 1 * p, '#1e272e');

      // Slumped resting arms
      this.pixelRect(-7 * p, -9 * p, 3 * p, 7 * p, palette.shirt);
      this.pixelRect(4 * p, -9 * p, 3 * p, 7 * p, palette.shirt);
      this.pixelRect(-5 * p, -3 * p, 3 * p, 2 * p, palette.skin);
      this.pixelRect(2 * p, -3 * p, 3 * p, 2 * p, palette.skin);

    } else if (agent.status === 'waiting') {
      // Patient waiting eyes with blink
      const blink = (frame % 120 < 8);
      if (blink) {
        this.pixelRect(-3 * p, headY + 4 * p, 2 * p, 1 * p, '#1e272e');
        this.pixelRect(1 * p, headY + 4 * p, 2 * p, 1 * p, '#1e272e');
      } else {
        this.pixelRect(-3 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');
        this.pixelRect(1 * p, headY + 3 * p, 2 * p, 2 * p, '#1e272e');
        this.pixelRect(-2 * p, headY + 3 * p, 1 * p, 1 * p, '#f59e0b');
        this.pixelRect(2 * p, headY + 3 * p, 1 * p, 1 * p, '#f59e0b');
      }

      // Calm arms resting on table
      this.pixelRect(-7 * p, -9 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(4 * p, -9 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(-6 * p, -3 * p, 3 * p, 2 * p, palette.skin);
      this.pixelRect(3 * p, -3 * p, 3 * p, 2 * p, palette.skin);

    } else if (agent.status === 'talking') {
      // Wide active eyes
      this.pixelRect(-3 * p, headY + 2 * p, 2 * p, 3 * p, '#1e272e');
      this.pixelRect(1 * p, headY + 2 * p, 2 * p, 3 * p, '#1e272e');
      this.pixelRect(-2 * p, headY + 2 * p, 1 * p, 1 * p, '#ffffff');
      this.pixelRect(2 * p, headY + 2 * p, 1 * p, 1 * p, '#ffffff');

      // Natural speech cadence mouth (3-4 times per second)
      const mouthOpen = (Math.floor(frame / 14) % 2 === 0);
      if (mouthOpen) {
        this.pixelRect(-1 * p, headY + 6 * p, 2 * p, 2 * p, '#e74c3c');
      } else {
        this.pixelRect(-1 * p, headY + 7 * p, 2 * p, 1 * p, '#c0392b');
      }

      // Smooth gesturing hand
      const gesturing = (Math.floor(frame / 30) % 2 === 1);
      this.pixelRect(-7 * p, -9 * p, 3 * p, 6 * p, palette.shirt);
      this.pixelRect(5 * p, (-10 - (gesturing ? 3 : 0)) * p, 3 * p, (gesturing ? 7 : 6) * p, palette.shirt);
      this.pixelRect(5 * p, (-12 - (gesturing ? 3 : 0)) * p, 3 * p, 3 * p, palette.skin);
    }

    // OVERHEAD DISPLAY BADGES
    if (isWalking) {
      this.drawWalkingBadge(0, headY - 4, agent, frame);
    } else if (isVisiting) {
      this.drawVisitingBubble(0, headY - 4, agent, frame);
    } else if (agent.currentVisit && !agent.currentVisit.isVisitor) {
      // Visited target agent: show reply bubble!
      this.drawReplyBubble(0, headY - 4, agent, frame);
    } else if (agent.status === 'working') {
      this.drawWorkingTaskBox(0, headY - 3, agent, frame);
    } else if (agent.status === 'sleeping') {
      this.drawSleepingBadge(0, headY - 4, agent, frame);
    } else if (agent.status === 'waiting') {
      this.drawWaitingBadge(0, headY - 4, agent, frame);
    } else if (agent.status === 'talking') {
      if (agent.room !== 'meeting' || agent.isSpeaking) {
        this.drawSpeechBubble(0, headY - 4, agent.message || 'Discussing...', frame);
      } else {
        this.drawNameBadge(0, headY - 4, agent);
      }
    } else {
      this.drawNameBadge(0, headY - 4, agent);
    }

    ctx.restore();
  }



  // Draw sleek 8-bit working task & progress HUD card with 100% CLEAR name
  drawWorkingTaskBox(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();

    const label = getAgentLabel(agent.name);
    const task = agent.message || 'Working...';
    const progress = (typeof agent.progress === 'number') ? agent.progress : 45;

    // Display text truncated cleanly to 12 chars
    const displayTask = task.length > 12 ? task.substring(0, 11) + '..' : task;

    const boxW = 74;
    const boxH = 24;
    const bx = Math.floor(x - boxW / 2);
    const by = Math.floor(y - boxH - 2);

    // Deep sci-fi dark HUD background
    ctx.fillStyle = 'rgba(8, 12, 22, 0.96)';
    ctx.fillRect(bx, by, boxW, boxH);

    // 8-bit Border (Cyan glow or Green if complete)
    const isDone = progress >= 100;
    const palette = PALETTES[agent.colorIndex % PALETTES.length];
    const roleColor = palette.shirt || '#00ffcc';
    const borderColor = isDone ? '#22c55e' : '#00ffcc';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Small pointer triangle pointing down to character's head
    ctx.fillStyle = 'rgba(8, 12, 22, 0.96)';
    ctx.beginPath();
    ctx.moveTo(x - 2, by + boxH);
    ctx.lineTo(x + 2, by + boxH);
    ctx.lineTo(x, by + boxH + 2);
    ctx.closePath();
    ctx.fill();

    // Top Header: Status dot + Clear Agent Name + Progress %
    // LED Dot
    ctx.fillStyle = roleColor;
    ctx.beginPath();
    ctx.arc(bx + 5, by + 5, 2, 0, Math.PI * 2);
    ctx.fill();

    // CLEAR FULL AGENT NAME
    ctx.font = 'bold 7px "Silkscreen", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 10, by + 5.5);

    // Progress %
    ctx.fillStyle = isDone ? '#22c55e' : '#fbbf24';
    ctx.textAlign = 'right';
    ctx.fillText(`${progress}%`, bx + boxW - 3, by + 5.5);

    // Middle: Task description
    ctx.font = '6px "Silkscreen", monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(displayTask, bx + 4, by + 12);

    // Bottom: 8-bit Segmented Progress Bar (8 segments)
    const segCount = 8;
    const segW = 6;
    const segH = 3;
    const segGap = 2;
    const totalSegW = segCount * segW + (segCount - 1) * segGap;
    const segStartX = bx + Math.floor((boxW - totalSegW) / 2);
    const segY = by + 18;

    const filledSegs = Math.round((progress / 100) * segCount);

    for (let i = 0; i < segCount; i++) {
      const sx = segStartX + i * (segW + segGap);
      if (i < filledSegs) {
        ctx.fillStyle = isDone ? '#22c55e' : ((i > 5) ? '#00ffcc' : '#0ea5e9');
      } else {
        ctx.fillStyle = '#1e293b';
      }
      ctx.fillRect(sx, segY, segW, segH);
    }

    ctx.restore();
  }

  // Draw clear name badge for sleeping agents with floating Zzz
  drawSleepingBadge(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(label).width;
    const w = tw + 20;
    const h = 13;
    const bx = Math.floor(x - w / 2);
    const by = Math.floor(y - h);

    // Deep background
    ctx.fillStyle = 'rgba(8, 12, 22, 0.96)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, h);

    // Zzz icon + Name
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('z', bx + 4, by + h / 2 + 0.5);

    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, bx + 13, by + h / 2 + 0.5);

    // Floating Zzz animation above the badge
    this.drawSleepZzz(x, by - 2, frame);
    ctx.restore();
  }

  // Draw clear name badge for waiting in queue agents with animated hourglass
  drawWaitingBadge(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    const boxW = 76;
    const boxH = 22;
    const bx = Math.floor(x - boxW / 2);
    const by = Math.floor(y - boxH - 2);

    // Deep sci-fi dark HUD background with amber border
    ctx.fillStyle = 'rgba(15, 12, 6, 0.96)';
    ctx.fillRect(bx, by, boxW, boxH);

    // Pulsing amber border
    const pulse = (Math.floor(frame / 25) % 2 === 0);
    ctx.strokeStyle = pulse ? '#f59e0b' : '#b45309';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, boxW, boxH);

    // Pointer down
    ctx.fillStyle = 'rgba(15, 12, 6, 0.96)';
    ctx.beginPath();
    ctx.moveTo(x - 2, by + boxH);
    ctx.lineTo(x + 2, by + boxH);
    ctx.lineTo(x, by + boxH + 2);
    ctx.closePath();
    ctx.fill();

    // LED Dot
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(bx + 6, by + 6, 2, 0, Math.PI * 2);
    ctx.fill();

    // Top: Clear Agent Name
    ctx.font = 'bold 7px "Silkscreen", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 12, by + 6.5);

    // Bottom: WAITING QUEUE badge with hourglass
    ctx.font = '6px "Silkscreen", monospace';
    ctx.fillStyle = '#fbbf24';
    const hourGlass = (Math.floor(frame / 30) % 2 === 0) ? '⏳' : '⌛';
    ctx.fillText(`${hourGlass} QUEUE`, bx + 6, by + 15.5);

    // Room target if available
    let targetText = 'WAITING';
    if (agent.message && agent.message.includes('Room')) {
      const match = agent.message.match(/Room\s*(\d)/i);
      if (match) targetText = `FOR RM ${match[1]}`;
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#d97706';
    ctx.fillText(targetText, bx + boxW - 4, by + 15.5);

    ctx.restore();
  }

  // Draw walking movement badge
  drawWalkingBadge(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    const targetName = agent.currentVisit ? getAgentLabel(agent.currentVisit.partnerName) : 'DESK';
    const text = `🚶 ${label} -> ${targetName}`;

    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(text).width;
    const w = tw + 12;
    const h = 14;
    const bx = Math.floor(x - w / 2);
    const by = Math.floor(y - h - 3);

    ctx.fillStyle = 'rgba(8, 14, 26, 0.95)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, h);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, by + h / 2 + 0.5);

    ctx.restore();
  }

  // Draw visiting question bubble
  drawVisitingBubble(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();
    const question = (agent.currentVisit && agent.currentVisit.question) ? agent.currentVisit.question : 'Syncing...';
    const maxChars = 22;
    const displayText = question.length > maxChars ? question.substring(0, maxChars - 2) + '..' : question;

    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(`❓ ${displayText}`).width;
    const bubbleW = Math.max(tw + 14, 52);
    const bubbleH = 17;
    // Staggered slightly to the right and higher up so it never overlaps target's reply!
    const bx = Math.floor(x - bubbleW / 2 + 18);
    const by = Math.floor(y - bubbleH - 18);

    // Amber border speech bubble
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Pointer down
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 2, by + bubbleH);
    ctx.lineTo(x + 4, by + bubbleH);
    ctx.lineTo(x, by + bubbleH + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`❓ ${displayText}`, bx + bubbleW / 2, by + bubbleH / 2 + 0.5);

    ctx.restore();
  }

  // Draw reply bubble for the agent being visited
  drawReplyBubble(x, y, agent, frame) {
    const ctx = this.ctx;
    ctx.save();
    const reply = (agent.currentVisit && agent.currentVisit.reply) ? agent.currentVisit.reply : 'Working on it!';
    const maxChars = 22;
    const displayText = reply.length > maxChars ? reply.substring(0, maxChars - 2) + '..' : reply;

    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(`💡 ${displayText}`).width;
    const bubbleW = Math.max(tw + 14, 52);
    const bubbleH = 17;
    // Positioned slightly to the left and below visitor's bubble!
    const bx = Math.floor(x - bubbleW / 2 - 18);
    const by = Math.floor(y - bubbleH - 3);

    // Green border reply bubble
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Pointer down
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 4, by + bubbleH);
    ctx.lineTo(x + 2, by + bubbleH);
    ctx.lineTo(x, by + bubbleH + 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`💡 ${displayText}`, bx + bubbleW / 2, by + bubbleH / 2 + 0.5);

    ctx.restore();
  }


  // Draw clear name badge for idle/meeting attendees
  drawNameBadge(x, y, agent) {

    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    const palette = PALETTES[agent.colorIndex % PALETTES.length];
    const roleColor = palette.shirt || '#00ffcc';

    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(label).width;
    const w = tw + 14;
    const h = 13;
    const bx = Math.floor(x - w / 2);
    const by = Math.floor(y - h);

    ctx.fillStyle = 'rgba(8, 12, 22, 0.96)';
    ctx.fillRect(bx, by, w, h);
    ctx.strokeStyle = roleColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, h);

    // LED Dot
    ctx.fillStyle = roleColor;
    ctx.beginPath();
    ctx.arc(bx + 5, by + h / 2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 10, by + h / 2 + 0.5);

    ctx.restore();
  }

  // Draw floating Zzz for sleeping agents
  drawSleepZzz(x, y, frame) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = '#00ffcc';
    ctx.shadowBlur = 4;

    const z1Offset = (frame * 0.7) % 36;
    const z2Offset = ((frame * 0.7) + 12) % 36;
    const z3Offset = ((frame * 0.7) + 24) % 36;

    const alpha1 = Math.max(0, 1 - (z1Offset / 36));
    const alpha2 = Math.max(0, 1 - (z2Offset / 36));
    const alpha3 = Math.max(0, 1 - (z3Offset / 36));

    ctx.globalAlpha = alpha1;
    ctx.fillText('z', x + 8 + Math.sin(frame * 0.1) * 3, y - z1Offset);

    ctx.globalAlpha = alpha2;
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText('Z', x + 14 + Math.sin((frame + 10) * 0.1) * 5, y - z2Offset);

    ctx.globalAlpha = alpha3;
    ctx.font = '13px "Press Start 2P", monospace';
    ctx.fillText('Z', x + 20 + Math.sin((frame + 20) * 0.1) * 7, y - z3Offset);

    ctx.restore();
  }

  // Draw pixel speech bubble (clean, compact, no room clipping)
  drawSpeechBubble(x, y, text, frame) {
    const ctx = this.ctx;
    ctx.save();

    // Clean conversational text (avoid giant paragraphs)
    let display = text;
    if (display.toLowerCase().startsWith('topic:')) {
      display = 'Discussing..';
    } else if (display.length > 12) {
      display = display.substring(0, 11) + '..';
    }

    ctx.font = '7px "Silkscreen", monospace';
    const textWidth = ctx.measureText(display).width;
    const bubbleW = Math.max(textWidth + 10, 38);
    const bubbleH = 16;
    const bx = Math.floor(x - bubbleW / 2);
    const by = Math.floor(y - bubbleH - 4);

    // Pixel bubble background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx, by, bubbleW, bubbleH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bubbleW, bubbleH);

    // Pointer triangle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x - 2, by + bubbleH);
    ctx.lineTo(x + 2, by + bubbleH);
    ctx.lineTo(x, by + bubbleH + 3);
    ctx.closePath();
    ctx.fill();

    // Inner text
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(display, x, by + bubbleH / 2);

    ctx.restore();
  }

  /**
   * Draw an executive desk nameplate on the front edge of the wooden workstation
   * Placed right in front of the laptop base - 100% visible, never overlapping!
   */
  drawDeskNameplate(x, y, agent) {
    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    const w = 58;
    const h = 12;
    const bx = Math.floor(x - w / 2);
    const by = Math.floor(y);

    // Nameplate body
    ctx.fillStyle = '#090d16';
    ctx.fillRect(bx, by, w, h);

    // Role color border
    const palette = PALETTES[agent.colorIndex % PALETTES.length];
    const roleColor = palette.shirt || '#475569';
    ctx.strokeStyle = roleColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, h);

    // Glowing status LED indicator
    const ledColor = agent.status === 'working' ? '#22c55e' : (agent.status === 'sleeping' ? '#ffbb00' : '#38bdf8');
    ctx.fillStyle = ledColor;
    ctx.shadowColor = ledColor;
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(bx + 6, by + h / 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Agent name in crisp bold 7px Silkscreen
    ctx.font = 'bold 7px "Silkscreen", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 12, by + h / 2 + 0.5);

    ctx.restore();
  }

  /**
   * Draw meeting room attendee table place card (crisp and clear)
   */
  drawMeetingNameBadge(x, y, agent) {
    const ctx = this.ctx;
    ctx.save();
    const label = getAgentLabel(agent.name);
    ctx.font = 'bold 7px "Silkscreen", monospace';
    const tw = ctx.measureText(label).width;
    const w = Math.min(tw + 10, 48);
    const h = 10;
    const bx = Math.floor(x - w / 2);
    const by = Math.floor(y);

    ctx.fillStyle = 'rgba(9, 13, 22, 0.96)';
    ctx.fillRect(bx, by, w, h);
    const palette = PALETTES[agent.colorIndex % PALETTES.length];
    ctx.strokeStyle = palette.shirt || '#38bdf8';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, h);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, by + h / 2 + 0.5);
    ctx.restore();
  }

  /**
   * Draw an 8-bit Office Laptop
   */
  drawLaptop(x, y, isWorking, frame) {
    const ctx = this.ctx;
    const p = 1.6; // scale (compact and sleek)

    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y));

    // Base / keyboard
    this.pixelRect(-7 * p, 0, 14 * p, 4 * p, '#475569');
    this.pixelRect(-6 * p, 1 * p, 12 * p, 2 * p, '#1e293b');

    // Screen
    this.pixelRect(-7 * p, -10 * p, 14 * p, 10 * p, '#334155');
    // Inner display
    const screenColor = isWorking ? '#0f172a' : '#1e1e24';
    this.pixelRect(-6 * p, -9 * p, 12 * p, 8 * p, screenColor);

    if (isWorking) {
      // Animated code lines on screen
      const colors = ['#22c55e', '#38bdf8', '#f59e0b', '#ec4899'];
      for (let i = 0; i < 4; i++) {
        const lineOffset = (Math.floor(frame / 6) + i) % 4;
        const color = colors[(i + Math.floor(frame / 12)) % colors.length];
        const lineW = 3 + ((i * 3 + frame) % 6);
        this.pixelRect(-5 * p, (-8 + i * 2) * p, lineW * p, 1 * p, color);
      }
      // Screen glow
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fillRect(-8 * p, -12 * p, 16 * p, 14 * p);
    }

    ctx.restore();
  }

  /**
   * Draw an Office Chair
   */
  drawChair(x, y) {
    const ctx = this.ctx;
    const p = 2.1; // scale (compact ergonomic chair)

    ctx.save();
    ctx.translate(Math.floor(x), Math.floor(y));

    // Chair backrest
    this.pixelRect(-5 * p, -16 * p, 10 * p, 12 * p, '#1e293b');
    this.pixelRect(-4 * p, -15 * p, 8 * p, 10 * p, '#334155');

    // Seat cushion
    this.pixelRect(-6 * p, -4 * p, 12 * p, 4 * p, '#1e293b');

    // Metal pole & base wheels
    this.pixelRect(-1 * p, 0, 2 * p, 4 * p, '#94a3b8');
    this.pixelRect(-5 * p, 4 * p, 10 * p, 2 * p, '#64748b');
    this.pixelRect(-6 * p, 6 * p, 2 * p, 2 * p, '#0f172a');
    this.pixelRect(4 * p, 6 * p, 2 * p, 2 * p, '#0f172a');

    ctx.restore();
  }
}

window.SpriteRenderer = SpriteRenderer;
