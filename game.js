(() => {
  "use strict";

  const canvas = document.getElementById("grid");
  const ctx = canvas.getContext("2d");

  const elGen = document.getElementById("generation");
  const elPop = document.getElementById("population");
  const btnPlay = document.getElementById("btn-play");
  const playIcon = document.getElementById("play-icon");
  const playLabel = document.getElementById("play-label");
  const btnStep = document.getElementById("btn-step");
  const btnClear = document.getElementById("btn-clear");
  const btnRandom = document.getElementById("btn-random");
  const btnGlider = document.getElementById("btn-glider");
  const btnPulsar = document.getElementById("btn-pulsar");
  const speedInput = document.getElementById("speed");
  const speedLabel = document.getElementById("speed-label");
  const gridSizeSelect = document.getElementById("grid-size");

  const COLORS = {
    dead: "#21262d",
    alive: "#3fb950",
    grid: "#30363d",
  };

  let cols = 60;
  let rows = 60;
  let cellSize = 10;
  let grid;
  let nextGrid;
  let generation = 0;
  let running = false;
  let animId = null;
  let lastTick = 0;

  let painting = false;
  let paintValue = 1;

  function createGrid(w, h) {
    return new Uint8Array(w * h);
  }

  function idx(x, y) {
    return y * cols + x;
  }

  function get(x, y) {
    if (x < 0 || x >= cols || y < 0 || y >= rows) return 0;
    return grid[idx(x, y)];
  }

  function set(x, y, val) {
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      grid[idx(x, y)] = val ? 1 : 0;
    }
  }

  function countNeighbors(x, y) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        n += get(x + dx, y + dy);
      }
    }
    return n;
  }

  function step() {
    let pop = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const alive = get(x, y);
        const neighbors = countNeighbors(x, y);
        let next = 0;
        if (alive && (neighbors === 2 || neighbors === 3)) next = 1;
        else if (!alive && neighbors === 3) next = 1;
        nextGrid[idx(x, y)] = next;
        pop += next;
      }
    }
    const tmp = grid;
    grid = nextGrid;
    nextGrid = tmp;
    generation++;
    updateStats(pop);
    draw();
  }

  function updateStats(pop) {
    elGen.textContent = generation;
    elPop.textContent = pop;
  }

  function population() {
    let pop = 0;
    for (let i = 0; i < grid.length; i++) pop += grid[i];
    return pop;
  }

  function parseGridSize(value) {
    if (value.includes("x")) {
      const [w, h] = value.split("x").map(Number);
      return { cols: w, rows: h };
    }
    return { cols: Number(value), rows: Number(value) };
  }

  function resizeCanvas() {
    const wrap = canvas.parentElement;
    const maxWidth = Math.min(wrap.clientWidth - 8, 900);
    const maxHeight = Math.min(window.innerHeight * 0.65, 520);
    cellSize = Math.max(1, Math.floor(Math.min(maxWidth / cols, maxHeight / rows)));
    const w = cols * cellSize;
    const h = rows * cellSize;
    canvas.width = w;
    canvas.height = h;
    draw();
  }

  function draw() {
    if (cellSize === 1) {
      drawImageData();
      return;
    }

    ctx.fillStyle = COLORS.dead;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cellDrawSize = cellSize - 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (get(x, y)) {
          ctx.fillStyle = COLORS.alive;
          ctx.fillRect(x * cellSize, y * cellSize, cellDrawSize, cellDrawSize);
        }
      }
    }

    if (cellSize >= 6) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        const px = x * cellSize + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvas.height);
      }
      for (let y = 0; y <= rows; y++) {
        const py = y * cellSize + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
      }
      ctx.stroke();
    }
  }

  function drawImageData() {
    const imageData = ctx.createImageData(cols, rows);
    const data = imageData.data;
    for (let i = 0; i < grid.length; i++) {
      const offset = i * 4;
      if (grid[i]) {
        data[offset] = 63;
        data[offset + 1] = 185;
        data[offset + 2] = 80;
        data[offset + 3] = 255;
      } else {
        data[offset] = 33;
        data[offset + 1] = 38;
        data[offset + 2] = 45;
        data[offset + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function initGrid(c, r) {
    cols = c;
    rows = r;
    grid = createGrid(cols, rows);
    nextGrid = createGrid(cols, rows);
    generation = 0;
    resizeCanvas();
    updateStats(0);
  }

  function clearGrid() {
    grid.fill(0);
    generation = 0;
    updateStats(0);
    draw();
  }

  function randomize(density = 0.25) {
    pause();
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.random() < density ? 1 : 0;
    }
    generation = 0;
    updateStats(population());
    draw();
  }

  function placePattern(cells, ox, oy) {
    pause();
    clearGrid();
    for (const [dx, dy] of cells) {
      set(ox + dx, oy + dy, 1);
    }
    updateStats(population());
    draw();
  }

  const GLIDER = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];

  const PULSAR = (() => {
    const raw = [
      "0011100111000",
      "0100000000010",
      "1000000000001",
      "1000011000001",
      "1000011000001",
      "0100000000010",
      "0011100111000",
    ];
    const cells = [];
    const half = raw.length;
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        if (raw[y][x] === "1") {
          cells.push([x, y], [13 - x, y], [x, 13 - y], [13 - x, 13 - y]);
        }
      }
    }
    const seen = new Set();
    return cells.filter(([x, y]) => {
      const k = `${x},${y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();

  function canvasToCell(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor(((clientX - rect.left) * scaleX) / cellSize);
    const y = Math.floor(((clientY - rect.top) * scaleY) / cellSize);
    return { x, y };
  }

  function paintAt(clientX, clientY) {
    const { x, y } = canvasToCell(clientX, clientY);
    if (x < 0 || x >= cols || y < 0 || y >= rows) return;
    set(x, y, paintValue);
    updateStats(population());
    draw();
  }

  function play() {
    if (running) return;
    running = true;
    btnPlay.classList.add("playing");
    playIcon.textContent = "⏸";
    playLabel.textContent = "Pause";
    lastTick = 0;
    animId = requestAnimationFrame(tick);
  }

  function pause() {
    running = false;
    btnPlay.classList.remove("playing");
    playIcon.textContent = "▶";
    playLabel.textContent = "Play";
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  function togglePlay() {
    running ? pause() : play();
  }

  function tick(now) {
    if (!running) return;
    const fps = Number(speedInput.value);
    const interval = 1000 / fps;
    if (now - lastTick >= interval) {
      step();
      lastTick = now;
    }
    animId = requestAnimationFrame(tick);
  }

  canvas.addEventListener("mousedown", (e) => {
    if (running) pause();
    painting = true;
    const { x, y } = canvasToCell(e.clientX, e.clientY);
    paintValue = get(x, y) ? 0 : 1;
    paintAt(e.clientX, e.clientY);
  });

  canvas.addEventListener("mousemove", (e) => {
    if (painting) paintAt(e.clientX, e.clientY);
  });

  window.addEventListener("mouseup", () => {
    painting = false;
  });

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (running) pause();
    painting = true;
    const t = e.touches[0];
    const { x, y } = canvasToCell(t.clientX, t.clientY);
    paintValue = get(x, y) ? 0 : 1;
    paintAt(t.clientX, t.clientY);
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (painting) {
      const t = e.touches[0];
      paintAt(t.clientX, t.clientY);
    }
  }, { passive: false });

  window.addEventListener("touchend", () => {
    painting = false;
  });

  btnPlay.addEventListener("click", togglePlay);
  btnStep.addEventListener("click", () => {
    pause();
    step();
  });
  btnClear.addEventListener("click", () => {
    pause();
    clearGrid();
  });
  btnRandom.addEventListener("click", () => randomize());
  btnGlider.addEventListener("click", () => {
    placePattern(GLIDER, Math.floor(cols / 2) - 1, Math.floor(rows / 2) - 1);
  });
  btnPulsar.addEventListener("click", () => {
    placePattern(PULSAR, Math.floor(cols / 2) - 7, Math.floor(rows / 2) - 7);
  });

  speedInput.addEventListener("input", () => {
    speedLabel.textContent = `${speedInput.value} fps`;
  });

  gridSizeSelect.addEventListener("change", () => {
    pause();
    const { cols: c, rows: r } = parseGridSize(gridSizeSelect.value);
    initGrid(c, r);
  });

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) {
      e.preventDefault();
      togglePlay();
    }
  });

  window.addEventListener("resize", resizeCanvas);

  initGrid(60, 60);
  randomize(0.3);
})();
