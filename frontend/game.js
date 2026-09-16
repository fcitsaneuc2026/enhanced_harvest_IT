const $ = (id) => document.getElementById(id);

const state = {
  playerName: "",
  score: 0,
  ordersCompleted: 0,
  timeLimit: 600,
  timeLeft: 600,
  startedAt: null,
  finishedAt: null,
  running: false,
  pyodide: null,
  scene: null,
  player: null,
  backpack: [null, null, null],
  currentOrder: null,
  orderNumber: 1,
  items: {},
  actionQueue: Promise.resolve(),
  gameEnded: false,
};

const stations = {
  fridge: { x: 100, y: 100, label: "Fridge", color: 0x9ac7e8 },
  cutting: { x: 240, y: 100, label: "Cutting Station", color: 0xd8b58b },
  frying: { x: 380, y: 100, label: "Fry Station", color: 0xe5a08d },
  plate: { x: 100, y: 340, label: "Plate Counter", color: 0xd6c2a5 },
  wash: { x: 240, y: 340, label: "Wash Sink", color: 0xa9d5d8 },
  serve: { x: 380, y: 340, label: "Serve Counter", color: 0xaed7a9 },
};

const recipes = {
  burger: {
    name: "Classic Burger",
    ingredients: ["bread", "patty", "lettuce"],
    emoji: "🍔",
  }
};

const itemInfo = {
  bread: { label: "Bread", emoji: "🍞", raw: "🍞", cooked: "🥯", state: "raw" },
  patty: { label: "Patty", emoji: "🥩", raw: "🥩", cooked: "🍖", state: "raw" },
  lettuce: { label: "Lettuce", emoji: "🥬", raw: "🥬", cooked: "🥗", state: "raw" },
  burger: { label: "Burger", emoji: "🍔" },
  dirty_plate: { label: "Dirty plate", emoji: "🍽️" },
  clean_plate: { label: "Clean plate", emoji: "🍽️" },
};

function log(message) {
  $("consoleOutput").textContent += `${message}\n`;
  $("consoleOutput").scrollTop = $("consoleOutput").scrollHeight;
}
function clearLog() { $("consoleOutput").textContent = ""; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function nearStation(name) {
  const s = stations[name];
  return state.player && distance(state.player, s) <= 48;
}
function updateHUD() {
  $("scoreValue").textContent = state.score;
  $("ordersValue").textContent = state.ordersCompleted;
  const m = Math.floor(state.timeLeft / 60);
  const s = Math.floor(state.timeLeft % 60).toString().padStart(2, "0");
  $("timeValue").textContent = `${m}:${s}`;
  $("playerStatus").innerHTML =
    `Position: <b>(${Math.round(state.player?.x || 0)}, ${Math.round(state.player?.y || 0)})</b><br>` +
    `Backpack: <b>${state.backpack.filter(Boolean).length}/3</b><br>` +
    `Order: <b>${state.currentOrder?.name || "None"}</b>`;
  renderBackpack();
}
function renderBackpack() {
  $("backpack").innerHTML = state.backpack.map((item, i) => {
    if (!item) return `<div class="slot"><span>Slot ${i}</span>—</div>`;
    const info = itemInfo[item.type] || itemInfo[item];
    return `<div class="slot">${item.emoji || info?.emoji || "📦"}<span>${item.type || item}</span></div>`;
  }).join("");
}
function newOrder() {
  state.currentOrder = { ...recipes.burger, id: state.orderNumber++ };
  $("orderCard").innerHTML = `<strong>Order #${state.currentOrder.id}: ${state.currentOrder.emoji} ${state.currentOrder.name}</strong>
    <div>Required: bread + patty + lettuce</div><div>Reward: 100 points</div>`;
}
function setGuide(tab) {
  const guides = {
    movement: ["Move close to a station", "Use coordinates. Interaction requires you to be near the station.", "move_to(100, 100)"],
    fridge: ["Collect ingredients", "Stand next to the fridge, then take an ingredient. The backpack has 3 slots.", 'move_to(100, 100)\ntake("bread")'],
    cutting: ["Cut lettuce", "Raw lettuce changes into prepared lettuce after cutting.", 'move_to(240, 100)\ncut("lettuce")'],
    fry: ["Fry bread or patty", "Bread and patty change visual state after frying.", 'move_to(380, 100)\nfry("patty")'],
    plate: ["Plate ingredients", "Use a clean plate and add prepared ingredients in any order.", 'move_to(100, 340)\nplate("patty")'],
    wash: ["Wash a dirty plate", "A used plate must be washed before it can be used again.", 'move_to(240, 340)\nwash_plate()'],
    serve: ["Serve the burger", "When the burger is complete, move to the serve counter and serve it.", 'move_to(380, 340)\nserve()'],
  };
  const [action, text, code] = guides[tab];
  $("guideAction").textContent = action;
  $("guideText").textContent = text;
  $("guideCode").textContent = code;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
}
document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setGuide(b.dataset.tab)));

class KitchenScene extends Phaser.Scene {
  constructor() { super("KitchenScene"); }
  create() {
    state.scene = this;
    this.cameras.main.setBackgroundColor("#d8e8c8");
    this.drawKitchen();
    state.player = { x: 60, y: 60 };
    this.playerSprite = this.add.text(60, 60, "🧑‍🍳", { fontSize: "32px" }).setOrigin(.5);
    this.playerSprite.setDepth(5);
    this.add.text(15, 15, "Kitchen coordinates", { fontSize: "12px", color: "#334433" });
    this.add.text(15, 30, "Move using Python commands", { fontSize: "11px", color: "#334433" });
    updateHUD();
  }
  drawKitchen() {
    this.add.rectangle(240, 240, 470, 450, 0xeaf4df).setStrokeStyle(4, 0x6a8060);
    Object.entries(stations).forEach(([name, s]) => {
      this.add.rectangle(s.x, s.y, 82, 62, s.color).setStrokeStyle(3, 0x53634e);
      this.add.text(s.x, s.y - 8, this.stationEmoji(name), { fontSize: "24px" }).setOrigin(.5);
      this.add.text(s.x, s.y + 24, s.label, { fontSize: "10px", color: "#233323" }).setOrigin(.5);
      this.add.text(s.x, s.y + 39, `(${s.x},${s.y})`, { fontSize: "9px", color: "#233323" }).setOrigin(.5);
    });
    this.add.text(240, 450, "Kitchen floor", { fontSize: "12px", color: "#6a8060" }).setOrigin(.5);
  }
  stationEmoji(name) {
    return { fridge: "🧊", cutting: "🔪", frying: "🍳", plate: "🍽️", wash: "🚰", serve: "🛎️" }[name];
  }
  movePlayer(x, y) {
    const nx = Phaser.Math.Clamp(Number(x), 35, 445);
    const ny = Phaser.Math.Clamp(Number(y), 55, 425);
    return new Promise(resolve => {
      this.tweens.add({
        targets: this.playerSprite,
        x: nx, y: ny, duration: Math.max(180, distance(state.player, {x:nx,y:ny}) * 4),
        onUpdate: () => {
          state.player.x = this.playerSprite.x;
          state.player.y = this.playerSprite.y;
          updateHUD();
        },
        onComplete: () => { state.player.x = nx; state.player.y = ny; updateHUD(); resolve(); }
      });
    });
  }
  showItemEffect(text, emoji) {
    const t = this.add.text(state.player.x, state.player.y - 35, `${emoji} ${text}`, { fontSize: "13px", color: "#1f3b1f", backgroundColor: "#ffffff" }).setOrigin(.5);
    this.tweens.add({ targets: t, y: t.y - 25, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }
}

function addItem(type, status = "raw") {
  const index = state.backpack.findIndex(x => !x);
  if (index === -1) throw new Error("Backpack is full. Maximum 3 items.");
  const info = itemInfo[type];
  state.backpack[index] = { type, status, emoji: status === "prepared" ? (type === "lettuce" ? "🥗" : info.cooked) : info.raw };
  renderBackpack();
}
function findItem(type) { return state.backpack.find(x => x && x.type === type); }
function removeItem(type) {
  const index = state.backpack.findIndex(x => x && x.type === type);
  if (index === -1) throw new Error(`You do not have ${type} in your backpack.`);
  const item = state.backpack[index]; state.backpack[index] = null; renderBackpack(); return item;
}
function requireNear(station) {
  if (!nearStation(station)) throw new Error(`Move close to ${stations[station].label} first. Target: (${stations[station].x}, ${stations[station].y}).`);
}
function requireItem(type) {
  const item = findItem(type);
  if (!item) throw new Error(`You do not have ${type}. Collect it from the fridge first.`);
  return item;
}
function action(fn) {
  state.actionQueue = state.actionQueue.then(fn);
  return state.actionQueue;
}

async function executeGameCommand(name, args) {
  if (state.gameEnded) throw new Error("The game has ended.");
  if (name === "move_to") {
    if (args.length !== 2) throw new Error("move_to(x, y) needs two numbers.");
    await action(() => state.scene.movePlayer(args[0], args[1]));
    log(`Moved to (${args[0]}, ${args[1]}).`);
    return;
  }
  if (name === "take") {
    requireNear("fridge");
    const type = String(args[0]);
    if (!["bread", "patty", "lettuce"].includes(type)) throw new Error("You can take bread, patty, or lettuce.");
    addItem(type);
    state.scene.showItemEffect(`Took ${type}`, itemInfo[type].raw);
    log(`Collected ${type}.`);
    return;
  }
  if (name === "cut") {
    requireNear("cutting");
    const item = requireItem(String(args[0]));
    if (item.type !== "lettuce") throw new Error("Only lettuce can be cut at this station.");
    item.status = "prepared"; item.emoji = "🥗";
    state.scene.showItemEffect("Lettuce prepared", "🥗");
    renderBackpack(); log("Lettuce changed from raw 🥬 to prepared 🥗.");
    return;
  }
  if (name === "fry") {
    requireNear("frying");
    const type = String(args[0]);
    const item = requireItem(type);
    if (!["bread", "patty"].includes(type)) throw new Error("Only bread or patty can be fried.");
    item.status = "prepared"; item.emoji = type === "bread" ? "🥯" : "🍖";
    state.scene.showItemEffect(`${type} fried`, item.emoji);
    renderBackpack(); log(`${type} changed visual state.`);
    return;
  }
  if (name === "plate") {
    requireNear("plate");
    const type = String(args[0]);
    const item = requireItem(type);
    if (item.status !== "prepared") throw new Error(`${type} must be prepared first.`);
    removeItem(type);
    state.items[type] = true;
    state.scene.showItemEffect(`Plated ${type}`, item.emoji);
    log(`Placed prepared ${type} on the plate.`);
    return;
  }
  if (name === "wash_plate") {
    requireNear("wash");
    state.items = {};
    state.scene.showItemEffect("Clean plate", "🍽️");
    log("Plate washed and reset.");
    return;
  }
  if (name === "serve") {
    requireNear("serve");
    const required = ["bread", "patty", "lettuce"];
    if (!required.every(x => state.items[x])) throw new Error("Burger is incomplete. Plate bread, patty, and lettuce first.");
    state.items = {};
    state.ordersCompleted += 1;
    state.score += 100;
    newOrder();
    state.scene.showItemEffect("Order served! +100", "🍔");
    log("Burger served! +100 points.");
    updateHUD();
    return;
  }
  if (name === "wait") {
    const seconds = Math.max(0, Math.min(10, Number(args[0] || 1)));
    await new Promise(r => setTimeout(r, seconds * 1000));
    log(`Waited ${seconds} second(s).`);
    return;
  }
  if (name === "status") {
    log(JSON.stringify({ position: state.player, backpack: state.backpack, plated: state.items, order: state.currentOrder }, null, 2));
    return;
  }
  throw new Error(`Unknown game command: ${name}`);
}

async function loadPython() {
  try {
    state.pyodide = await loadPyodide();
    await state.pyodide.runPythonAsync(`
import js
def move_to(x, y): js.execute_game_command("move_to", [x, y])
def take(item): js.execute_game_command("take", [item])
def cut(item): js.execute_game_command("cut", [item])
def fry(item): js.execute_game_command("fry", [item])
def plate(item): js.execute_game_command("plate", [item])
def wash_plate(): js.execute_game_command("wash_plate", [])
def serve(): js.execute_game_command("serve", [])
def wait(seconds=1): js.execute_game_command("wait", [seconds])
def status(): js.execute_game_command("status", [])
`);
    $("pyStatus").textContent = "Python ready";
    $("runBtn").disabled = false;
    $("consoleOutput").textContent = "Python ready. Write commands and click Run Python.";
  } catch (e) {
    $("pyStatus").textContent = "Python failed";
    log("Could not load Pyodide: " + e);
  }
}

window.execute_game_command = async (name, args) => {
  try { await executeGameCommand(name, args); }
  catch (e) { log("ERROR: " + e.message); throw e; }
};

async function runPython() {
  if (!state.pyodide || state.gameEnded) return;
  clearLog();
  const code = $("codeEditor").value;
  log("Running Python…");
  try {
    await state.pyodide.runPythonAsync(code);
    log("Python execution finished.");
  } catch (e) {
    log("Python error: " + e.message);
  }
}

function startTimer() {
  const timer = setInterval(() => {
    if (!state.running || state.gameEnded) { clearInterval(timer); return; }
    state.timeLeft -= 1;
    updateHUD();
    if (state.timeLeft <= 0) finishGame();
  }, 1000);
}

async function finishGame() {
  if (state.gameEnded) return;
  state.gameEnded = true; state.running = false; state.finishedAt = new Date();
  $("gameScreen").classList.add("hidden");
  $("resultScreen").classList.remove("hidden");
  $("resultSummary").innerHTML = `<p><b>${state.playerName}</b>, your time is up.</p>
    <p>Score: <b>${state.score}</b></p><p>Orders completed: <b>${state.ordersCompleted}</b></p>`;
  try {
    const response = await fetch("/api/scores", {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({
        player_name: state.playerName, score: state.score, game_mode: "Solo Burger Rush",
        time_completed: new Date().toISOString(), orders_completed: state.ordersCompleted
      })
    });
    if (!response.ok) throw new Error("Score upload failed");
    $("resultSummary").innerHTML += `<p class="small-note">Score saved to the shared leaderboard.</p>`;
  } catch (e) {
    $("resultSummary").innerHTML += `<p class="small-note">Could not save score. Check the server connection.</p>`;
  }
}

async function showLeaderboard() {
  $("resultScreen").classList.add("hidden");
  $("leaderboardScreen").classList.remove("hidden");
  try {
    const response = await fetch("/api/leaderboard");
    const rows = await response.json();
    if (!rows.length) { $("leaderboardContent").textContent = "No scores yet."; return; }
    $("leaderboardContent").innerHTML = `<table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Mode</th><th>Completed</th><th>Orders</th></tr></thead><tbody>` +
      rows.map((r, i) => `<tr><td>${i+1}</td><td>${escapeHtml(r.player_name)}</td><td>${r.score}</td><td>${escapeHtml(r.game_mode)}</td><td>${new Date(r.time_completed).toLocaleString()}</td><td>${r.orders_completed}</td></tr>`).join("") +
      `</tbody></table>`;
  } catch (e) { $("leaderboardContent").textContent = "Could not load leaderboard."; }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

$("startBtn").addEventListener("click", () => {
  const name = $("playerName").value.trim();
  if (!name) return alert("Please enter a player name.");
  state.playerName = name; state.score = 0; state.ordersCompleted = 0; state.timeLeft = state.timeLimit;
  state.backpack = [null, null, null]; state.items = {}; state.orderNumber = 1; state.gameEnded = false; state.running = true;
  $("startScreen").classList.add("hidden"); $("resultScreen").classList.add("hidden"); $("leaderboardScreen").classList.add("hidden"); $("gameScreen").classList.remove("hidden");
  if (!state.scene) {
    const config = { type: Phaser.AUTO, width: 480, height: 480, parent: "gameContainer", backgroundColor: "#d8e8c8", scene: KitchenScene };
    new Phaser.Game(config);
  }
  newOrder(); updateHUD(); startTimer();
});
$("runBtn").addEventListener("click", runPython);
$("clearBtn").addEventListener("click", () => { $("codeEditor").value = ""; clearLog(); });
$("hintBtn").addEventListener("click", () => {
  log('Hint: move_to(100, 100), take("bread"), move_to(380, 100), fry("bread")');
});
$("leaderboardBtn").addEventListener("click", showLeaderboard);
$("backBtn").addEventListener("click", () => { $("leaderboardScreen").classList.add("hidden"); $("resultScreen").classList.remove("hidden"); });
$("restartBtn").addEventListener("click", () => location.reload());

fetch("/api/health").then(r => r.json()).then(() => $("connectionStatus").textContent = "LAN server connected").catch(() => $("connectionStatus").textContent = "Server unavailable");
loadPython();
