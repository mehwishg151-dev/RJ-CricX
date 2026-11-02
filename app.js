// --- AUDIO SYNTHESIZER ENGINE (Web Audio API) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type = "sine", duration = 0.15) {
  if (!state.settings.sound || !audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

function playCelebration(isSix = false) {
  if (isSix) {
    playTone(523.25, "square", 0.1);
    setTimeout(() => playTone(659.25, "square", 0.15), 100);
    setTimeout(() => playTone(783.99, "square", 0.25), 220);
  } else {
    playTone(440, "triangle", 0.12);
    setTimeout(() => playTone(554.37, "triangle", 0.18), 120);
  }
}

function playWicketSound() {
  playTone(220, "sawtooth", 0.3);
  setTimeout(() => playTone(146.83, "sawtooth", 0.4), 150);
}

// --- STATE MANAGEMENT ---
const INITIAL_STATE = {
  teamA: "Royal Strikers",
  teamB: "Thunder Kings",
  maxOvers: 6,
  currentInnings: 1,
  target: 0,
  isMatchOver: false,
  innings1: null,
  
  // Current active innings metrics
  battingTeam: "Royal Strikers",
  totalRuns: 0,
  totalWickets: 0,
  legalBalls: 0,
  wides: 0,
  noBalls: 0,
  partnershipRuns: 0,
  partnershipBalls: 0,
  
  striker: { name: "Sameer (C)", runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: "not out" },
  nonStriker: { name: "Rohan (wk)", runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: "not out" },
  bowler: { name: "Sunny (C)", legalBalls: 0, runsConceded: 0, wickets: 0, maidens: 0 },
  
  allBatters: [],
  allBowlers: [],
  fow: [],
  history: [],
  radarBalls: [],
  settings: { sound: true, vibrate: true }
};

let state = JSON.parse(localStorage.getItem("rj_cricx_master_state")) || initNewMatchState();

function initNewMatchState() {
  const s = JSON.parse(JSON.stringify(INITIAL_STATE));
  s.allBatters.push(s.striker);
  s.allBatters.push(s.nonStriker);
  s.allBowlers.push(s.bowler);
  return s;
}

function saveState() {
  localStorage.setItem("rj_cricx_master_state", JSON.stringify(state));
  renderUI();
}

function playHaptic() {
  if (state.settings.vibrate && navigator.vibrate) navigator.vibrate(30);
}

// --- SCORING ENGINE ---
function addDelivery(runsBat, isWide = false, isNoBall = false, isFour = false, isSix = false) {
  if (state.isMatchOver) {
    alert("Match is already completed! Click '+ NEW MATCH' to start again.");
    return;
  }
  
  if (audioCtx.state === 'suspended') audioCtx.resume();
  playHaptic();
  
  // Snapshot for UNDO
  state.history.push(JSON.parse(JSON.stringify(state)));

  let extraRuns = 0;
  const isLegal = !isWide && !isNoBall;

  if (isWide) {
    extraRuns = 1;
    state.wides += 1;
    state.bowler.runsConceded += 1;
    playTone(350, "sine", 0.08);
  } else if (isNoBall) {
    extraRuns = 1;
    state.noBalls += 1;
    state.bowler.runsConceded += (runsBat + 1);
    state.striker.runs += runsBat;
    state.striker.balls += 1;
    playTone(300, "square", 0.1);
  } else {
    state.bowler.runsConceded += runsBat;
    state.striker.runs += runsBat;
    state.striker.balls += 1;
    if (runsBat > 0 && !isFour && !isSix) playTone(440, "sine", 0.05);
  }

  if (isFour) { state.striker.fours += 1; playCelebration(false); }
  if (isSix) { state.striker.sixes += 1; playCelebration(true); }

  const ballTotal = runsBat + extraRuns;
  state.totalRuns += ballTotal;
  state.partnershipRuns += ballTotal;
  if (isLegal) state.partnershipBalls += 1;

  // Radar Stream Entry
  let badgeClass = "";
  let badgeText = `${ballTotal}`;
  if (isFour) { badgeClass = "four"; badgeText = "4"; }
  else if (isSix) { badgeClass = "six"; badgeText = "6"; }
  else if (isWide) { badgeClass = "extra"; badgeText = "Wd"; }
  else if (isNoBall) { badgeClass = "extra"; badgeText = "Nb"; }
  state.radarBalls.push({ text: badgeText, class: badgeClass });

  // Legal Ball Count & Over
  let overFinished = false;
  if (isLegal) {
    state.legalBalls += 1;
    state.bowler.legalBalls += 1;
    if (state.legalBalls % 6 === 0) overFinished = true;
  }

  // Strike Rotation (MCC Law 18.11)
  const isBoundary = isFour || isSix;
  if (!isBoundary && (runsBat % 2 !== 0)) swapCrease();

  // Commentary
  if (isSix) setComm(`SIX! Smashed high and handsome by ${state.striker.name}!`);
  else if (isFour) setComm(`FOUR! Driven through the ropes by ${state.striker.name}!`);
  else if (isWide) setComm(`Wide ball conceded by ${state.bowler.name}.`);
  else if (isNoBall) setComm(`No-Ball! Free hit upcoming.`);
  else if (runsBat === 0) setComm(`Dot ball, good disciplined bowling.`);
  else setComm(`${runsBat} run(s) taken cleanly.`);

  // Check 2nd Innings Target Reached
  if (state.currentInnings === 2 && state.totalRuns >= state.target) {
    state.isMatchOver = true;
    const wicketsLeft = 10 - state.totalWickets;
    setComm(`MATCH OVER! ${state.battingTeam} won by ${wicketsLeft} wicket(s)! 🎉`);
    alert(`🎉 MATCH FINISHED! ${state.battingTeam} chased the target and won!`);
    saveState();
    return;
  }

  // Check Innings/Match Complete by Overs
  if (state.legalBalls >= (state.maxOvers * 6)) {
    handleInningsEnd();
    return;
  }

  // Over Finished Dialog
  if (overFinished) {
    swapCrease();
    state.radarBalls = [];
    openBowlerModal();
  }

  saveState();
}

function handleInningsEnd() {
  if (state.currentInnings === 1) {
    state.target = state.totalRuns + 1;
    state.innings1 = {
      team: state.battingTeam,
      runs: state.totalRuns,
      wickets: state.totalWickets,
      overs: `${Math.floor(state.legalBalls/6)}.${state.legalBalls%6}`
    };
    alert(`1st Innings Complete! ${state.battingTeam} scored ${state.totalRuns}/${state.totalWickets}. Target is ${state.target} runs.`);
    
    // Switch to 2nd Innings
    state.currentInnings = 2;
    state.battingTeam = state.teamB;
    state.totalRuns = 0;
    state.totalWickets = 0;
    state.legalBalls = 0;
    state.wides = 0;
    state.noBalls = 0;
    state.partnershipRuns = 0;
    state.partnershipBalls = 0;
    state.radarBalls = [];
    state.striker = { name: "Batter 1", runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: "not out" };
    state.nonStriker = { name: "Batter 2", runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: "not out" };
    state.bowler = { name: "Opening Bowler", legalBalls: 0, runsConceded: 0, wickets: 0, maidens: 0 };
    state.allBatters = [state.striker, state.nonStriker];
    state.allBowlers = [state.bowler];
    setComm(`2nd Innings Begins! ${state.battingTeam} need ${state.target} runs to win.`);
    saveState();
  } else {
    // 2nd innings overs complete
    state.isMatchOver = true;
    if (state.totalRuns === (state.target - 1)) {
      setComm("MATCH TIED! Scores level at the end of the chase!");
      alert("MATCH TIED! 🤝");
    } else {
      const margin = (state.target - 1) - state.totalRuns;
      setComm(`MATCH OVER! ${state.teamA} won by ${margin} run(s)!`);
      alert(`MATCH OVER! ${state.teamA} won by ${margin} run(s)! 🏆`);
    }
    saveState();
  }
}

function swapCrease() {
  const temp = state.striker;
  state.striker = state.nonStriker;
  state.nonStriker = temp;
}

function swapStrikeManual() {
  playHaptic();
  swapCrease();
  setComm("Strike rotated manually by scorer.");
  saveState();
}

// --- WICKET MODAL LOGIC ---
function openWicketModal() {
  playHaptic();
  document.getElementById("wicketModal").style.display = "flex";
}

function closeWicketModal() {
  document.getElementById("wicketModal").style.display = "none";
}

function confirmWicket() {
  state.history.push(JSON.parse(JSON.stringify(state)));
  playWicketSound();

  const whoOut = document.getElementById("whoIsOutSelect").value;
  const type = document.getElementById("dismissalSelect").value;
  const incoming = document.getElementById("incomingBatterInput").value.trim() || `Batter ${state.totalWickets + 3}`;

  state.totalWickets += 1;
  state.bowler.wickets += 1;
  state.legalBalls += 1;
  state.bowler.legalBalls += 1;
  state.partnershipRuns = 0;
  state.partnershipBalls = 0;

  state.radarBalls.push({ text: "W", class: "wicket" });

  const dismissedPlayer = (whoOut === "striker") ? state.striker : state.nonStriker;
  dismissedPlayer.isOut = true;
  dismissedPlayer.dismissal = `${type} b ${state.bowler.name}`;

  const newBatter = { name: incoming, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dismissal: "not out" };
  state.allBatters.push(newBatter);

  const ovDisplay = `${Math.floor(state.legalBalls/6)}.${state.legalBalls%6}`;
  state.fow.push(`${state.totalWickets}-${state.totalRuns} (${dismissedPlayer.name}, ${ovDisplay} ov)`);

  if (whoOut === "striker") state.striker = newBatter;
  else state.nonStriker = newBatter;

  closeWicketModal();
  setComm(`WICKET! ${dismissedPlayer.name} OUT (${type})! ${incoming} is next batter.`);

  // Check All Out
  if (state.totalWickets >= 10) {
    alert("Batting team is ALL OUT!");
    handleInningsEnd();
    return;
  }

  if (state.legalBalls % 6 === 0) {
    swapCrease();
    state.radarBalls = [];
    openBowlerModal();
  }

  saveState();
}

// --- BOWLER CHANGE MODAL ---
function openBowlerModal() {
  document.getElementById("bowlerOverNotice").innerText = `Previous bowler: ${state.bowler.name}. Select next bowler (consecutive overs prohibited).`;
  document.getElementById("nextBowlerInput").value = "";
  document.getElementById("bowlerModal").style.display = "flex";
}

function confirmNextBowler() {
  const name = document.getElementById("nextBowlerInput").value.trim() || `Bowler ${state.allBowlers.length + 1}`;
  let existing = state.allBowlers.find(b => b.name.toLowerCase() === name.toLowerCase());
  if (!existing) {
    existing = { name: name, legalBalls: 0, runsConceded: 0, wickets: 0, maidens: 0 };
    state.allBowlers.push(existing);
  }
  state.bowler = existing;
  document.getElementById("bowlerModal").style.display = "none";
  saveState();
}

// --- SCORECARD MODAL RENDER ---
function openScorecardModal() {
  let batRows = state.allBatters.map(b => `
    <tr>
      <td>${b.name} <br><small style="color:#8e9bae;">${b.dismissal}</small></td>
      <td><b>${b.runs}</b></td>
      <td>${b.balls}</td>
      <td>${b.fours}</td>
      <td>${b.sixes}</td>
      <td>${b.balls > 0 ? ((b.runs/b.balls)*100).toFixed(1) : "0.0"}</td>
    </tr>
  `).join("");

  let bowlRows = state.allBowlers.map(bw => {
    const ov = `${Math.floor(bw.legalBalls/6)}.${bw.legalBalls%6}`;
    const econ = bw.legalBalls > 0 ? (bw.runsConceded / (bw.legalBalls/6)).toFixed(2) : "0.00";
    return `
      <tr>
        <td>${bw.name}</td>
        <td>${ov}</td>
        <td>${bw.runsConceded}</td>
        <td><b>${bw.wickets}</b></td>
        <td>${econ}</td>
      </tr>
    `;
  }).join("");

  let fowText = state.fow.length > 0 ? state.fow.join(" • ") : "No wickets fallen yet.";

  document.getElementById("scorecardContent").innerHTML = `
    <div class="sc-title">${state.battingTeam.toUpperCase()} BATTING</div>
    <table class="sc-table">
      <thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
      <tbody>${batRows}</tbody>
    </table>

    <div class="sc-title">BOWLING FIGURES</div>
    <table class="sc-table">
      <thead><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
      <tbody>${bowlRows}</tbody>
    </table>

    <div class="sc-title">FALL OF WICKETS</div>
    <p style="font-size:10px; color:#8e9bae; font-family:monospace; margin-bottom:10px;">${fowText}</p>
  `;

  document.getElementById("scorecardModal").style.display = "flex";
}

function closeScorecardModal() {
  document.getElementById("scorecardModal").style.display = "none";
}

// --- SETTINGS MODAL ---
function openSettingsModal() {
  document.getElementById("settingSound").checked = state.settings.sound;
  document.getElementById("settingVibrate").checked = state.settings.vibrate;
  document.getElementById("settingsModal").style.display = "flex";
}
function closeSettingsModal() {
  document.getElementById("settingsModal").style.display = "none";
}
function toggleSound() {
  state.settings.sound = document.getElementById("settingSound").checked;
  saveState();
}
function toggleVibrate() {
  state.settings.vibrate = document.getElementById("settingVibrate").checked;
  saveState();
}

// --- NEW MATCH MODAL ---
function openNewMatchModal() {
  document.getElementById("newMatchModal").style.display = "flex";
}
function closeNewMatchModal() {
  document.getElementById("newMatchModal").style.display = "none";
}
function confirmNewMatch() {
  const teamA = document.getElementById("newTeamA").value.trim() || "Team A";
  const teamB = document.getElementById("newTeamB").value.trim() || "Team B";
  const overs = parseInt(document.getElementById("newOvers").value) || 6;

  state = initNewMatchState();
  state.teamA = teamA;
  state.teamB = teamB;
  state.battingTeam = teamA;
  state.maxOvers = overs;
  state.striker.name = `${teamA} Opener 1`;
  state.nonStriker.name = `${teamA} Opener 2`;
  state.bowler.name = `${teamB} Bowler 1`;
  state.allBatters = [state.striker, state.nonStriker];
  state.allBowlers = [state.bowler];

  closeNewMatchModal();
  setComm(`New match started! ${teamA} vs ${teamB} (${overs} Overs).`);
  saveState();
}

// --- UNDO FUNCTION ---
function undoLastBall() {
  if (state.history.length === 0) {
    alert("No deliveries left to undo!");
    return;
  }
  playHaptic();
  state = state.history.pop();
  setComm("Last delivery undone successfully.");
  saveState();
}

function setComm(text) {
  document.getElementById("commBody").innerText = text;
}

function renameTeam() {
  const n = prompt("Enter Batting Team Name:", state.battingTeam);
  if (n) { state.battingTeam = n; saveState(); }
}

function renamePlayer(type) {
  const n = prompt(`Rename ${type}:`, state[type].name);
  if (n) { state[type].name = n; saveState(); }
}

function shareMatch() {
  const text = `RJ CricX Live: ${state.battingTeam} ${state.totalRuns}/${state.totalWickets} (${Math.floor(state.legalBalls/6)}.${state.legalBalls%6} ov).`;
  if (navigator.share) navigator.share({ title: "RJ CricX Live", text: text });
  else alert(text);
}

// --- UI RENDER LOOP ---
function renderUI() {
  document.getElementById("teamName").innerText = state.battingTeam;
  document.getElementById("totalRuns").innerText = state.totalRuns;
  document.getElementById("totalWickets").innerText = state.totalWickets;

  const ov = `${Math.floor(state.legalBalls / 6)}.${state.legalBalls % 6}`;
  document.getElementById("completedOvers").innerText = ov;
  document.getElementById("maxOversLabel").innerText = `/${state.maxOvers} ov`;
  document.getElementById("innIndicator").innerText = `INN ${state.currentInnings} OF 2`;

  // Target Chase Display
  if (state.currentInnings === 2) {
    document.getElementById("targetRow").style.display = "flex";
    document.getElementById("targetText").innerText = state.target;
    const needRuns = Math.max(0, state.target - state.totalRuns);
    const ballsRemaining = Math.max(0, (state.maxOvers * 6) - state.legalBalls);
    document.getElementById("needText").innerText = `Need ${needRuns} in ${ballsRemaining}b`;
    
    // REQ RR
    const reqRR = (ballsRemaining > 0) ? ((needRuns / (ballsRemaining / 6))).toFixed(2) : "--";
    document.getElementById("reqVal").innerText = reqRR;
  } else {
    document.getElementById("targetRow").style.display = "none";
    document.getElementById("reqVal").innerText = "--";
  }

  // Partnership & Extras
  document.getElementById("partnershipText").innerText = `${state.partnershipRuns} runs (${state.partnershipBalls}b)`;
  const crr = state.legalBalls > 0 ? (state.totalRuns / (state.legalBalls / 6)).toFixed(2) : "0.00";
  document.getElementById("crrVal").innerText = crr;
  document.getElementById("extrasVal").innerText = `${state.wides + state.noBalls} (wd ${state.wides}, nb ${state.noBalls})`;

  // Batters
  document.getElementById("strikerName").innerText = state.striker.name;
  document.getElementById("strikerRuns").innerText = state.striker.runs;
  document.getElementById("strikerBalls").innerText = state.striker.balls;
  document.getElementById("strikerSR").innerText = state.striker.balls > 0 ? ((state.striker.runs / state.striker.balls) * 100).toFixed(1) : "0.00";

  document.getElementById("nonStrikerName").innerText = state.nonStriker.name;
  document.getElementById("nonStrikerRuns").innerText = state.nonStriker.runs;
  document.getElementById("nonStrikerBalls").innerText = state.nonStriker.balls;
  document.getElementById("nonStrikerSR").innerText = state.nonStriker.balls > 0 ? ((state.nonStriker.runs / state.nonStriker.balls) * 100).toFixed(1) : "0.00";

  // Bowler
  document.getElementById("bowlerName").innerText = state.bowler.name;
  const bOv = `${Math.floor(state.bowler.legalBalls / 6)}.${state.bowler.legalBalls % 6}`;
  document.getElementById("bowlerFigures").innerText = `${bOv} ov • ${state.bowler.runsConceded}r • ${state.bowler.wickets}w`;

  // Radar Stream
  const radarEl = document.getElementById("radarBalls");
  if (state.radarBalls.length === 0) {
    radarEl.innerHTML = `<span class="empty-radar">Waiting for delivery...</span>`;
  } else {
    radarEl.innerHTML = state.radarBalls.map(b => `<div class="ball-badge ${b.class}">${b.text}</div>`).join("");
  }
}

// Initial Boot
renderUI();
