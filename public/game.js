/* ================================================
   Jemima's Terminal Adventure — game.js
   ================================================
   Section 1: Filesystem State & Helpers
   Section 2: Command Implementations
   Section 3: Terminal Engine
   Section 4: Mission Data
   Section 5: Mission Engine
   Section 6: File Tree Renderer
   Section 7: Assessment Engine
   Section 8: UI Utilities & Event Listeners
   ================================================ */

'use strict';

// ================================================
// Section 1: Filesystem State & Helpers
// ================================================

function freshFilesystem() {
  return {
    name: 'home', type: 'dir',
    children: {
      'documents': {
        type: 'dir', children: {
          'notes.txt': { type: 'file' }
        }
      },
      'projects': {
        type: 'dir', children: {}
      }
    }
  };
}

let filesystem = freshFilesystem();
let currentCwd = ['home'];    // absolute path segments
let commandHistory = [];
let historyIndex = -1;

// Deep-clone the filesystem
function cloneFs(node) {
  if (node.type === 'file') return { type: 'file' };
  const children = {};
  for (const [k, v] of Object.entries(node.children)) {
    children[k] = cloneFs(v);
  }
  return { name: node.name, type: 'dir', children };
}

// Get the node at an absolute path array (or null)
function getNode(pathArr) {
  let node = filesystem;
  for (let i = 1; i < pathArr.length; i++) {
    if (!node.children || !node.children[pathArr[i]]) return null;
    node = node.children[pathArr[i]];
  }
  return node;
}

// Resolve a path string relative to cwd into an absolute path array
// Returns null if invalid
function resolvePath(cwd, target) {
  if (!target || target === '~') return ['home'];

  let parts;
  if (target.startsWith('/')) {
    parts = target.replace(/^\/+/, '').split('/').filter(Boolean);
    parts = ['home', ...parts];
  } else {
    parts = [...cwd];
    for (const seg of target.split('/').filter(Boolean)) {
      if (seg === '.') continue;
      if (seg === '..') {
        if (parts.length > 1) parts.pop();
      } else {
        parts = [...parts, seg];
      }
    }
  }
  return parts;
}

function cwdString() {
  return '~/' + currentCwd.join('/');
}

function updatePrompt() {
  const el = document.getElementById('terminal-prompt');
  if (el) el.textContent = `jemima@terminal:${cwdString()} $`;
}

// ================================================
// Section 2: Command Implementations
// ================================================

function cmdPwd() {
  return { type: 'output', text: '/' + currentCwd.join('/') };
}

function cmdLs(args) {
  const targetPath = args[0] ? resolvePath(currentCwd, args[0]) : currentCwd;
  const node = getNode(targetPath);
  if (!node) return { type: 'error', text: `ls: cannot access '${args[0]}': No such file or directory` };
  if (node.type === 'file') return { type: 'output', text: targetPath[targetPath.length - 1] };

  const entries = Object.entries(node.children);
  if (entries.length === 0) return { type: 'output', text: '(empty directory)' };

  const parts = entries.map(([name, child]) =>
    child.type === 'dir' ? name + '/' : name
  ).sort();
  return { type: 'output', text: parts.join('  ') };
}

function cmdCd(args) {
  if (!args[0] || args[0] === '~') {
    currentCwd = ['home'];
    updatePrompt();
    renderFileTree();
    return { type: 'output', text: '' };
  }
  const newPath = resolvePath(currentCwd, args[0]);
  const node = getNode(newPath);
  if (!node) {
    return { type: 'error', text: `cd: no such file or directory: ${args[0]}` };
  }
  if (node.type === 'file') {
    return { type: 'error', text: `cd: not a directory: ${args[0]}` };
  }
  currentCwd = newPath;
  updatePrompt();
  renderFileTree();
  return { type: 'output', text: '' };
}

function cmdMkdir(args) {
  if (!args[0]) return { type: 'error', text: 'mkdir: missing operand' };

  // Validate name - no slashes for simple mkdir
  const dirName = args[0];
  if (dirName.includes('/')) return { type: 'error', text: 'mkdir: please use a simple directory name (no slashes)' };

  const parentNode = getNode(currentCwd);
  if (!parentNode || parentNode.type !== 'dir') {
    return { type: 'error', text: 'mkdir: cannot create directory here' };
  }
  if (parentNode.children[dirName]) {
    return { type: 'error', text: `mkdir: cannot create directory '${dirName}': File exists` };
  }
  parentNode.children[dirName] = { type: 'dir', children: {} };
  renderFileTree();
  return { type: 'output', text: '' };
}

function cmdHelp() {
  return {
    type: 'output',
    text:
      'Available commands:\n' +
      '  pwd          — print current directory\n' +
      '  ls           — list files and folders\n' +
      '  cd [dir]     — change directory\n' +
      '  cd ..        — go up one level\n' +
      '  mkdir [name] — create a new folder\n' +
      '  clear        — clear the terminal\n' +
      '  help         — show this help'
  };
}

// ================================================
// Section 3: Terminal Engine
// ================================================

const COMMANDS = { pwd: cmdPwd, ls: cmdLs, cd: cmdCd, mkdir: cmdMkdir, help: cmdHelp };

// All commands run, stored for mission checking
let runHistory = [];   // array of { cmd, args, result, cwdBefore, cwdAfter, fsSnapshot }

function runCommand(raw) {
  const input = raw.trim();
  if (!input) return;

  // Add to history
  commandHistory.unshift(input);
  historyIndex = -1;

  // Echo the command
  appendTerminalLine({ type: 'command', text: input });

  if (input === 'clear') {
    clearTerminalHistory();
    return;
  }

  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  const cwdBefore = [...currentCwd];
  let result;

  if (COMMANDS[cmd]) {
    result = COMMANDS[cmd](args);
  } else {
    result = { type: 'error', text: `command not found: ${cmd}\nType 'help' to see available commands.` };
  }

  if (result.text) {
    appendTerminalLine(result);
  }

  const entry = { cmd, args, input, result, cwdBefore, cwdAfter: [...currentCwd], fsSnapshot: cloneFs(filesystem) };
  runHistory.push(entry);

  // Check mission success
  checkMissionSuccess(entry);
}

function appendTerminalLine({ type, text }) {
  const history = document.getElementById('terminal-history');
  if (!history) return;

  const lines = text.split('\n');
  for (const line of lines) {
    const div = document.createElement('div');
    div.className = 'term-line';
    if (type === 'command') {
      const prompt = document.createElement('span');
      prompt.className = 'term-prompt-line';
      prompt.textContent = `jemima@terminal:${cwdString()} $ `;
      const cmd = document.createElement('span');
      cmd.className = 'term-command-text';
      cmd.textContent = line;
      div.appendChild(prompt);
      div.appendChild(cmd);
    } else if (type === 'error') {
      div.className += ' term-error';
      div.textContent = line;
    } else if (type === 'info') {
      div.className += ' term-info';
      div.textContent = line;
    } else {
      div.className += ' term-output';
      div.textContent = line;
    }
    history.appendChild(div);
  }
  history.scrollTop = history.scrollHeight;
}

function clearTerminalHistory() {
  const history = document.getElementById('terminal-history');
  if (history) history.innerHTML = '';
}

function tabComplete(input) {
  const parts = input.split(/\s+/);
  if (parts.length < 2) return input;

  const cmd = parts[0];
  if (!['cd', 'ls', 'mkdir'].includes(cmd)) return input;

  const partial = parts[parts.length - 1];
  const node = getNode(currentCwd);
  if (!node || node.type !== 'dir') return input;

  const matches = Object.keys(node.children).filter(name => name.startsWith(partial) && node.children[name].type === 'dir');
  if (matches.length === 1) {
    parts[parts.length - 1] = matches[0];
    return parts.join(' ');
  }
  if (matches.length > 1) {
    appendTerminalLine({ type: 'info', text: matches.join('  ') });
  }
  return input;
}

// ================================================
// Section 4: Mission Data
// ================================================

const MISSIONS = [
  {
    id: 1,
    title: 'Where Am I?',
    badge: 'MISSION 1',
    story: 'You just arrived at the terminal! Before you can go anywhere, you need to know where you already are. Use `pwd` — "Print Working Directory" — to see your current location.',
    steps: ['Type the command `pwd` and press Enter'],
    hint: 'Try typing: pwd',
    xp: 100,
    setup(fs, cwd) {
      // reset to defaults
    },
    successCondition(history) {
      return history.some(e => e.cmd === 'pwd');
    }
  },
  {
    id: 2,
    title: "What's Here?",
    badge: 'MISSION 2',
    story: "Great — you know where you are! Now let's look around. The `ls` command lists everything in your current folder. Run it to see what's here.",
    steps: ['Type `ls` to list the files and folders'],
    hint: 'Try typing: ls',
    xp: 100,
    setup() {},
    successCondition(history) {
      return history.some(e => e.cmd === 'ls');
    }
  },
  {
    id: 3,
    title: 'Move Around',
    badge: 'MISSION 3',
    story: "You can see there's a `documents` folder here. Use `cd documents` to go inside it. `cd` stands for \"Change Directory.\"",
    steps: ['Use `cd documents` to move into the documents folder', 'Run `pwd` to confirm your new location'],
    hint: 'Try: cd documents',
    xp: 100,
    setup() {},
    successCondition(history, cwd) {
      return cwd.includes('documents');
    }
  },
  {
    id: 4,
    title: 'Going Back Up',
    badge: 'MISSION 4',
    story: "You're inside `documents` — good! Now use `cd ..` to go back up to your home folder. The two dots `..` always mean \"go up one level.\"",
    steps: ['Type `cd ..` to go back to home', 'Run `pwd` to confirm you\'re back'],
    hint: 'Try: cd ..',
    xp: 100,
    initialCwd: ['home', 'documents'],
    setup() {},
    successCondition(history, cwd) {
      const wentBack = history.some(e => e.cmd === 'cd' && e.args[0] === '..' && e.cwdAfter.length < e.cwdBefore.length);
      return wentBack && cwd.length === 1;
    }
  },
  {
    id: 5,
    title: 'Build Something',
    badge: 'MISSION 5',
    story: "Time to create! Use `mkdir my-work` to make a brand new folder. `mkdir` means \"Make Directory.\" Watch the file tree on the right update instantly!",
    steps: ['Type `mkdir my-work` to create a new folder', 'Run `ls` to see your new folder'],
    hint: 'Try: mkdir my-work',
    xp: 100,
    setup() {},
    successCondition(history, cwd, fs) {
      const homeNode = getNode(['home']);
      return homeNode && homeNode.children && homeNode.children['my-work'];
    }
  },
  {
    id: 6,
    title: 'Grand Challenge',
    badge: 'MISSION 6',
    story: "Final challenge! Create the folder `mission-complete` inside `projects`, then navigate into it and confirm your location. Use ALL four commands you've learned!",
    steps: [
      'Navigate to the `projects` folder',
      'Create a folder called `mission-complete`',
      'Navigate into `mission-complete`',
      'Run `pwd` to confirm your location'
    ],
    hint: 'Start with: cd projects',
    xp: 200,
    setup() {},
    successCondition(history, cwd, fs) {
      // Need: be inside projects/mission-complete AND that dir exists AND pwd was run there
      const inMissionComplete = cwd.includes('projects') && cwd.includes('mission-complete');
      const ranPwd = history.some(e => e.cmd === 'pwd' && e.cwdAfter.includes('mission-complete'));
      return inMissionComplete && ranPwd;
    }
  }
];

// ================================================
// Section 5: Mission Engine
// ================================================

let currentMissionIndex = 0;
let totalXP = 0;
const MAX_XP = 600;

function loadMission(index) {
  const mission = MISSIONS[index];
  if (!mission) return;

  // Reset filesystem and cwd for fresh start
  filesystem = freshFilesystem();
  currentCwd = mission.initialCwd ? [...mission.initialCwd] : ['home'];
  runHistory = [];
  updatePrompt();
  renderFileTree();

  // Update mission panel
  document.getElementById('mission-badge').textContent = mission.badge;
  document.getElementById('mission-title').textContent = mission.title;
  document.getElementById('mission-story').textContent = mission.story;

  // Build steps list
  const stepsList = document.getElementById('steps-list');
  stepsList.innerHTML = '';
  mission.steps.forEach(step => {
    const li = document.createElement('li');
    const check = document.createElement('span');
    check.className = 'step-check';
    check.textContent = '✓';
    const text = document.createElement('span');
    text.textContent = step;
    li.appendChild(check);
    li.appendChild(text);
    stepsList.appendChild(li);
  });


  // Welcome message in terminal
  clearTerminalHistory();
  appendTerminalLine({ type: 'info', text: `--- Mission ${mission.id}: ${mission.title} ---` });
  appendTerminalLine({ type: 'info', text: "Type 'help' if you need a reminder of commands." });
}

function checkMissionSuccess(entry) {
  if (currentMissionIndex >= MISSIONS.length) return;
  const mission = MISSIONS[currentMissionIndex];
  if (mission.successCondition(runHistory, currentCwd, filesystem)) {
    setTimeout(() => completeMission(mission), 300);
  }
}

function completeMission(mission) {
  // Award XP
  totalXP += mission.xp;
  updateXPBar();
  saveProgress();

  // Mark all steps done
  document.querySelectorAll('#steps-list li').forEach(li => li.classList.add('done'));

  // Show success overlay
  document.getElementById('success-title').textContent = 'Mission Complete!';
  document.getElementById('success-message').textContent = `You completed "${mission.title}"! Keep it up!`;
  document.getElementById('success-xp-amount').textContent = mission.xp;

  const nextBtn = document.getElementById('btn-next-mission');
  const assessBtn = document.getElementById('btn-start-assessment');

  const isLast = currentMissionIndex === MISSIONS.length - 1;
  if (isLast) {
    nextBtn.classList.add('hidden');
    assessBtn.classList.remove('hidden');
  } else {
    nextBtn.classList.remove('hidden');
    assessBtn.classList.add('hidden');
  }

  showOverlay('overlay-success');
  launchConfetti();
}

function advanceToNextMission() {
  hideOverlay('overlay-success');
  currentMissionIndex++;
  saveProgress();
  if (currentMissionIndex < MISSIONS.length) {
    loadMission(currentMissionIndex);
  }
}

// ================================================
// Section 6: File Tree Renderer
// ================================================

function renderFileTree() {
  const container = document.getElementById('file-tree');
  const cwdDisplay = document.getElementById('cwd-display');
  if (!container) return;

  container.innerHTML = '';
  if (cwdDisplay) cwdDisplay.textContent = cwdString();

  renderNode(container, filesystem, 0, ['home']);
}

function renderNode(container, node, depth, nodePath) {
  const item = document.createElement('div');
  item.className = 'tree-item';

  // Indent
  for (let i = 0; i < depth; i++) {
    const indent = document.createElement('span');
    indent.className = 'tree-indent';
    item.appendChild(indent);
  }

  const icon = document.createElement('span');
  icon.className = 'tree-icon';

  const label = document.createElement('span');

  if (node.type === 'dir') {
    const isCurrentDir = arraysEqual(nodePath, currentCwd);
    const isAncestor = currentCwd.length > nodePath.length && arraysEqual(currentCwd.slice(0, nodePath.length), nodePath);

    if (isCurrentDir) {
      item.classList.add('tree-dir', 'tree-current-dir');
      icon.textContent = '📂';
      label.textContent = node.name || nodePath[nodePath.length - 1];
      label.style.fontWeight = '700';
    } else {
      item.classList.add('tree-dir');
      icon.textContent = isAncestor ? '📂' : '📁';
      label.textContent = node.name || nodePath[nodePath.length - 1];
    }
    item.appendChild(icon);
    item.appendChild(label);
    container.appendChild(item);

    // Render children
    if (node.children) {
      const childNames = Object.keys(node.children).sort();
      for (const childName of childNames) {
        const childNode = { ...node.children[childName], name: childName };
        renderNode(container, childNode, depth + 1, [...nodePath, childName]);
      }
    }
  } else {
    item.classList.add('tree-file');
    icon.textContent = '📄';
    label.textContent = node.name || nodePath[nodePath.length - 1];
    item.appendChild(icon);
    item.appendChild(label);
    container.appendChild(item);
  }
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ================================================
// Section 7: Assessment Engine
// ================================================

const QUIZ_QUESTIONS = [
  {
    question: 'What does `pwd` stand for?',
    options: [
      'Print Working Directory',
      'Path With Directory',
      'Previous Working Directory',
      'Print With Data'
    ],
    correct: 0
  },
  {
    question: 'Which command lists the files and folders in your current location?',
    options: ['cd', 'mkdir', 'ls', 'pwd'],
    correct: 2
  },
  {
    question: "You're in `/home/documents`. You type `cd ..` — where are you now?",
    options: ['/home', '/home/documents/..', '/documents', '/'],
    correct: 0
  },
  {
    question: 'What does `mkdir photos` do?',
    options: [
      'Moves into a folder called photos',
      'Lists all folders',
      'Deletes the photos folder',
      'Creates a new folder called photos'
    ],
    correct: 3
  }
];

// Part A task definitions
const PART_A_TASKS = [
  {
    instruction: 'Print your current directory using the correct command.',
    check: (history) => history.some(e => e.cmd === 'pwd'),
    hint: 'Use: pwd'
  },
  {
    instruction: "List the contents of the current folder.",
    check: (history) => history.some(e => e.cmd === 'ls'),
    hint: 'Use: ls'
  },
  {
    instruction: "Move into the folder called 'archive'.",
    check: (history, cwd) => cwd.includes('archive'),
    hint: 'Use: cd archive'
  },
  {
    instruction: "Go back up one level to the parent folder.",
    check: (history, cwd) => history.some(e => e.cmd === 'cd' && e.args[0] === '..' && e.cwdAfter.length < e.cwdBefore.length),
    hint: 'Use: cd ..'
  },
  {
    instruction: "Create a new folder called 'reports'.",
    check: (history, cwd, fs) => {
      // Check if reports exists anywhere accessible
      const home = getNode(['home']);
      if (!home) return false;
      // Check in current directory context
      const cur = getNode(currentCwd);
      return cur && cur.children && cur.children['reports'];
    },
    hint: 'Use: mkdir reports'
  },
  {
    instruction: "Enter the 'reports' folder and confirm your location with pwd.",
    check: (history, cwd) => {
      const inReports = cwd.includes('reports');
      const ranPwd = history.some(e => e.cmd === 'pwd' && e.cwdAfter.includes('reports'));
      return inReports && ranPwd;
    },
    hint: 'Use: cd reports, then pwd'
  }
];

function freshAssessmentFilesystem() {
  return {
    name: 'home', type: 'dir',
    children: {
      'archive': { type: 'dir', children: { 'old-notes.txt': { type: 'file' } } },
      'music': { type: 'dir', children: {} }
    }
  };
}

let assessmentState = null;

function startAssessment() {
  hideOverlay('overlay-success');

  assessmentState = {
    partAIndex: 0,
    partAScore: 0,
    partBIndex: 0,
    partBScore: 0,
    partAHistory: [],
    phase: 'intro'
  };

  // Set up assessment filesystem
  filesystem = freshAssessmentFilesystem();
  currentCwd = ['home'];
  runHistory = [];
  updatePrompt();
  renderFileTree();
  clearTerminalHistory();

  appendTerminalLine({ type: 'info', text: '--- Assessment time! Complete each task shown in the left panel. ---' });

  loadPartATask(0);
}

function loadPartATask(index) {
  assessmentState.phase = 'partA';
  assessmentState.partAIndex = index;
  assessmentState.partAHistory = [];
  assessmentState.taskDone = false;

  // Reset filesystem fresh for each task
  filesystem = freshAssessmentFilesystem();
  currentCwd = ['home'];
  runHistory = [];
  updatePrompt();
  renderFileTree();

  const task = PART_A_TASKS[index];

  // Show task in mission panel
  document.getElementById('mission-badge').textContent = 'ASSESSMENT — PART A';
  document.getElementById('mission-title').textContent = `Task ${index + 1} of ${PART_A_TASKS.length}`;
  document.getElementById('mission-story').textContent = task.instruction;

  const stepsList = document.getElementById('steps-list');
  stepsList.innerHTML = '';
  const scoreLi = document.createElement('li');
  const scoreCheck = document.createElement('span');
  scoreCheck.className = 'step-check';
  scoreCheck.style.border = 'none';
  scoreCheck.textContent = '📝';
  const scoreText = document.createElement('span');
  scoreText.textContent = `Score so far: ${assessmentState.partAScore} / 60 pts`;
  scoreLi.appendChild(scoreCheck);
  scoreLi.appendChild(scoreText);
  stepsList.appendChild(scoreLi);

  appendTerminalLine({ type: 'info', text: `--- Task ${index + 1} of ${PART_A_TASKS.length}: ${task.instruction} ---` });
}

function checkPartATask(entry) {
  if (!assessmentState || assessmentState.phase !== 'partA') return;
  if (assessmentState.taskDone) return;  // prevent double-firing during the delay
  const task = PART_A_TASKS[assessmentState.partAIndex];
  assessmentState.partAHistory.push(entry);

  if (task.check(assessmentState.partAHistory, currentCwd, filesystem)) {
    assessmentState.taskDone = true;  // lock so extra commands don't re-trigger
    assessmentState.partAScore += 10;
    showToast('Correct! +10 pts');

    const nextIndex = assessmentState.partAIndex + 1;
    setTimeout(() => {
      if (nextIndex < PART_A_TASKS.length) {
        loadPartATask(nextIndex);
      } else {
        startPartB();
      }
    }, 1200);
  }
}

function startPartB() {
  assessmentState.phase = 'partB';
  assessmentState.partBIndex = 0;
  assessmentState.partBScore = 0;

  clearTerminalHistory();
  appendTerminalLine({ type: 'info', text: `--- Part A done: ${assessmentState.partAScore}/60 pts. Now answer the quiz in the left panel. ---` });

  loadPartBQuestion(0);
}

function loadPartBQuestion(index) {
  assessmentState.partBIndex = index;
  const q = QUIZ_QUESTIONS[index];

  // Show quiz in mission panel
  document.getElementById('mission-badge').textContent = 'ASSESSMENT — PART B';
  document.getElementById('mission-title').textContent = `Question ${index + 1} of ${QUIZ_QUESTIONS.length}`;
  document.getElementById('mission-story').textContent = q.question;

  const stepsList = document.getElementById('steps-list');
  stepsList.innerHTML = '';

  q.options.forEach((opt, i) => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    const check = document.createElement('span');
    check.className = 'step-check';
    check.textContent = String.fromCharCode(65 + i); // A, B, C, D
    check.style.fontSize = '0.7rem';
    check.style.fontWeight = '700';
    const text = document.createElement('span');
    text.textContent = opt;
    li.appendChild(check);
    li.appendChild(text);
    li.addEventListener('click', () => handleQuizAnswer(i, q.correct, stepsList));
    stepsList.appendChild(li);
  });
}

function handleQuizAnswer(chosen, correct, container) {
  const items = container.querySelectorAll('li');
  items.forEach(li => (li.style.pointerEvents = 'none'));

  if (chosen === correct) {
    items[chosen].classList.add('done');
    assessmentState.partBScore += 10;
    showToast('Correct! +10 pts');
  } else {
    items[chosen].style.color = 'var(--accent-red)';
    items[chosen].style.borderColor = 'rgba(239, 83, 80, 0.3)';
    items[correct].classList.add('done');
    showToast('Not quite — the correct answer is highlighted.');
  }

  const nextIndex = assessmentState.partBIndex + 1;
  setTimeout(() => {
    if (nextIndex < QUIZ_QUESTIONS.length) {
      loadPartBQuestion(nextIndex);
    } else {
      finishAssessment();
    }
  }, 1500);
}

function finishAssessment() {

  const partA = assessmentState.partAScore;
  const partB = assessmentState.partBScore;
  const total = partA + partB;

  document.getElementById('results-score').textContent = total;
  document.getElementById('breakdown-a').textContent = `${partA} / 60`;
  document.getElementById('breakdown-b').textContent = `${partB} / 40`;

  let grade, gradeClass;
  if (total >= 90) { grade = 'Terminal Pro! 🚀';   gradeClass = 'grade-pro'; }
  else if (total >= 70) { grade = 'Great work! ⭐'; gradeClass = 'grade-great'; }
  else if (total >= 50) { grade = 'Good start! 👍'; gradeClass = 'grade-good'; }
  else { grade = 'Keep going! 💪';                  gradeClass = 'grade-keep'; }

  const gradeEl = document.getElementById('results-grade');
  gradeEl.textContent = grade;
  gradeEl.className = gradeClass;

  showOverlay('overlay-results');
  launchConfetti();
}

function copyScore() {
  const score = document.getElementById('results-score').textContent;
  const partA = document.getElementById('breakdown-a').textContent;
  const partB = document.getElementById('breakdown-b').textContent;
  const grade = document.getElementById('results-grade').textContent;

  const text = `Jemima's Terminal Adventure — Assessment Results\n` +
    `Overall: ${score}/100 — ${grade}\n` +
    `Part A (Practical): ${partA}\n` +
    `Part B (Quiz): ${partB}`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Score copied to clipboard!');
  }).catch(() => {
    showToast('Could not copy — please screenshot instead.');
  });
}

// ================================================
// Section 8: UI Utilities & Event Listeners
// ================================================

// ===== localStorage Progress =====
function saveProgress() {
  try {
    localStorage.setItem('terminalGame', JSON.stringify({
      missionIndex: currentMissionIndex,
      xp: totalXP
    }));
  } catch (e) {}
}

function loadProgress() {
  try {
    const saved = localStorage.getItem('terminalGame');
    if (saved) {
      const data = JSON.parse(saved);
      currentMissionIndex = data.missionIndex || 0;
      totalXP = data.xp || 0;
    }
  } catch (e) {}
}

function clearProgress() {
  try { localStorage.removeItem('terminalGame'); } catch (e) {}
}

function updateXPBar() {
  const pct = Math.min((totalXP / MAX_XP) * 100, 100);
  const fill = document.getElementById('xp-bar-fill');
  const val = document.getElementById('xp-value');
  if (fill) fill.style.width = pct + '%';
  if (val) val.textContent = `${totalXP} / ${MAX_XP}`;
}

function showOverlay(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideOverlay(id) {
  document.getElementById(id).classList.add('hidden');
}

let toastTimer = null;
function showToast(message, duration = 2200) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, duration);
}

// ===== Confetti =====
let confettiAnimId = null;
const CONFETTI_COLORS = ['#f0c040', '#64b5f6', '#4caf85', '#ef5350', '#ab7ae0', '#fff'];

function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * -canvas.height * 0.3,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 3,
    w: 8 + Math.random() * 7,
    h: 6 + Math.random() * 5,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    rot: Math.random() * Math.PI * 2,
    rotV: (Math.random() - 0.5) * 0.2
  }));

  if (confettiAnimId) cancelAnimationFrame(confettiAnimId);
  let elapsed = 0;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotV;
      p.vy += 0.06; // gravity
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 220);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    elapsed++;
    if (elapsed < 240) {
      confettiAnimId = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('terminal-input');

  // Submit command on Enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value;
      input.value = '';
      runCommand(val);

      // Route to assessment checker if in assessment
      if (assessmentState && assessmentState.phase === 'partA' && runHistory.length > 0) {
        checkPartATask(runHistory[runHistory.length - 1]);
      }
    }

    // Arrow up — history back
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        historyIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
        input.value = commandHistory[historyIndex];
        setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
      }
    }

    // Arrow down — history forward
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = commandHistory[historyIndex];
      } else {
        historyIndex = -1;
        input.value = '';
      }
    }

    // Tab — autocomplete
    if (e.key === 'Tab') {
      e.preventDefault();
      input.value = tabComplete(input.value);
    }
  });

  // Keep input focused when clicking terminal area
  document.getElementById('terminal-wrapper').addEventListener('click', () => {
    input.focus();
  });

  // Next mission button
  document.getElementById('btn-next-mission').addEventListener('click', advanceToNextMission);

  // Start assessment button
  document.getElementById('btn-start-assessment').addEventListener('click', startAssessment);

  // Copy score button
  document.getElementById('btn-copy-score').addEventListener('click', copyScore);

  // Play again button
  document.getElementById('btn-play-again').addEventListener('click', () => {
    hideOverlay('overlay-results');
    currentMissionIndex = 0;
    totalXP = 0;
    assessmentState = null;
    clearProgress();
    updateXPBar();
    loadMission(0);
  });

  // ===== Init =====
  loadProgress();
  updateXPBar();
  loadMission(currentMissionIndex);
  renderFileTree();
  input.focus();

  // Prevent body scroll bleed
  document.body.addEventListener('wheel', e => e.preventDefault(), { passive: false });
});
