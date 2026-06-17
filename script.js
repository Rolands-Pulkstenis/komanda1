// Full game logic: spawning entities, click handling, sleep/score, game over.
document.addEventListener('DOMContentLoaded', () => {
	const startBtn = document.getElementById('startBtn');
	const pauseBtn = document.getElementById('pauseBtn');
	const timeEl = document.getElementById('time');
	const sleepMeter = document.getElementById('sleepMeter');
	const scoreEl = document.getElementById('score');
	const gameArea = document.getElementById('game-area');
	const alarmClock = document.getElementById('alarmClock');
	const alarmClockImg = document.getElementById('alarmClockImg');

	let tickInterval = null;
	let spawnInterval = null;
	let seconds = 0;
	let score = 0;
	let running = false;
	let entityId = 0;

	// registry for active entities so we can pause/resume their timers
	const entities = new Map();

	function pauseEntities() {
		const now = Date.now();
		entities.forEach((data, key) => {
			// clear timeouts/intervals and store remaining time
			if (data.expire) {
				clearTimeout(data.expire);
				data.remaining = Math.max(0, data.endTime - now);
				data.expire = null;
			}
			if (data.moveInt) {
				clearInterval(data.moveInt);
				data.moveInt = null;
			}
		});
	}

	function resumeEntities() {
		entities.forEach((data, key) => {
			// resume expire timers
			if (!data.expire) {
				const rem = data.remaining != null ? data.remaining : Math.max(0, data.endTime - Date.now());
				data.expire = setTimeout(() => {
					onEntityMiss(data.type);
					if (data.el) data.el.remove();
					entities.delete(key);
				}, rem);
				data.endTime = Date.now() + rem;
				data.remaining = null;
			}
			// resume movement for flies
			if (data.type === 'fly' && !data.moveInt && data.el) {
				const rect = gameArea.getBoundingClientRect();
				const w = Math.max(40, rect.width * 0.08);
				const h = Math.max(40, rect.height * 0.08);
				data.moveInt = setInterval(() => {
					const nx = Math.random() * (rect.width - w);
					const ny = Math.random() * (rect.height - h);
					data.el.style.left = `${nx}px`;
					data.el.style.top = `${ny}px`;
				}, 600);
			}
		});
	}

	const config = {
		baseDecay: 0.3, // per second
		spawnRateMs: 1400,
		maxEntities: 6,
	};

	const types = [
		{type: 'dog', weight: 15},
		{type: 'door', weight: 12},
		{type: 'fly', weight: 20},
		{type: 'sandman', weight: 8},
	];

	function setAlarmState(active) {
		if (!alarmClock || !alarmClockImg) return;
		alarmClockImg.src = active ? 'images/alarmclock_on.png' : 'images/alarmclock_off.png';
		alarmClock.classList.toggle('alarm-off', !active);
	}

	function flashAlarm() {
		if (!alarmClock) return;
		alarmClock.classList.remove('alarm-flash');
		void alarmClock.offsetWidth;
		alarmClock.classList.add('alarm-flash');
		window.setTimeout(() => alarmClock.classList.remove('alarm-flash'), 340);
	}

	function weightedPick() {
		const total = types.reduce((s, t) => s + t.weight, 0);
		let r = Math.random() * total;
		for (const t of types) {
			if (r < t.weight) return t.type;
			r -= t.weight;
		}
		return types[0].type;
	}

	function updateHUD() {
		const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
		const ss = String(seconds % 60).padStart(2, '0');
		timeEl.textContent = `${mm}:${ss}`;
		scoreEl.textContent = String(score);
	}

	function endGame() {
		running = false;
		clearInterval(tickInterval);
		clearInterval(spawnInterval);
		// disable buttons
		startBtn.disabled = false;
		pauseBtn.disabled = true;
		// show overlay
		showOverlay(`Spēle beigusies — rezultāts: ${score}`);
	}

	function showOverlay(text) {
		let overlay = document.getElementById('game-overlay');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.id = 'game-overlay';
			overlay.className = 'game-overlay';
			overlay.innerHTML = `<div class="overlay-inner"><p id="overlay-text"></p><button id="restartBtn">Restart</button></div>`;
			document.body.appendChild(overlay);
			document.getElementById('restartBtn').addEventListener('click', () => {
				overlay.remove();
				resetGame();
			});
		}
		document.getElementById('overlay-text').textContent = text;
	}

	function resetGame() {
		// clear existing entities and their timers
		entities.forEach((data) => {
			if (data.expire) clearTimeout(data.expire);
			if (data.moveInt) clearInterval(data.moveInt);
			if (data.el) data.el.remove();
		});
		entities.clear();
		seconds = 0; score = 0;
		sleepMeter.value = sleepMeter.max || 100;
		setAlarmState(true);
		updateHUD();
	}

	function spawnEntity() {
		if (document.querySelectorAll('.entity').length >= config.maxEntities) return;
		const type = weightedPick();
		const id = `e-${entityId++}`;
		const el = document.createElement('div');
		el.className = `entity ${type}`;
		el.dataset.type = type;
		el.id = id;

		// random position inside gameArea
		const rect = gameArea.getBoundingClientRect();
		const w = Math.max(40, rect.width * 0.08);
		const h = Math.max(40, rect.height * 0.08);
		const x = Math.random() * (rect.width - w);
		const y = Math.random() * (rect.height - h);
		el.style.left = `${x}px`;
		el.style.top = `${y}px`;

		// create image for the entity if available
		const img = document.createElement('img');
		img.className = 'entity-img';
		img.alt = type;
		function getImageForType(t) {
			const map = {
				alarm: 'alarmclock_on.png',
				dog: 'dog_bark.png',
				door: 'door_open.png',
				fly: 'fly.png',
				sandman: 'sandman.png'
			};
			return `images/${map[t] || 'New Piskel (6).png'}`;
		}
		img.src = getImageForType(type);
		el.appendChild(img);
		gameArea.appendChild(el);

		// behavior: lifetime and special movements
		let lifetime = 6000 + Math.random() * 5000; // 6-11s
		if (type === 'fly') lifetime = 5000 + Math.random() * 3000;
		if (type === 'sandman') lifetime = 4000 + Math.random() * 6000;
		let doorSlot = -1;

		function randomDoorPosition() {
			const edgePad = 18;
			const positions = [
				{left: edgePad, top: rect.height * 0.18},
				{left: edgePad, top: rect.height * 0.52},
				{left: rect.width - w - edgePad, top: rect.height * 0.22},
				{left: rect.width - w - edgePad, top: rect.height * 0.56},
				{left: rect.width * 0.25, top: edgePad},
				{left: rect.width * 0.58, top: edgePad},
			];
			let nextIndex = Math.floor(Math.random() * positions.length);
			if (positions.length > 1) {
				while (nextIndex === doorSlot) {
					nextIndex = Math.floor(Math.random() * positions.length);
				}
			}
			doorSlot = nextIndex;
			return positions[nextIndex];
		}

		function placeDoor(nextOpen) {
			const pos = randomDoorPosition();
			el.style.left = `${Math.max(10, Math.min(rect.width - w - 10, pos.left))}px`;
			el.style.top = `${Math.max(10, Math.min(rect.height - h - 10, pos.top))}px`;
			img.src = `images/${nextOpen ? 'door_open.png' : 'door_closed.png'}`;
		}

		// For fly, add gentle movement
		let moveInt = null;
		if (type === 'fly') {
			moveInt = setInterval(() => {
				const nx = Math.random() * (rect.width - w);
				const ny = Math.random() * (rect.height - h);
				el.style.left = `${nx}px`;
				el.style.top = `${ny}px`;
			}, 1400);
		}

		let doorResetTimer = null;
		let doorLocked = false;
		if (type === 'door') {
			placeDoor(false);
			doorResetTimer = setInterval(() => {
				if (doorLocked) return;
				doorLocked = true;
				img.src = 'images/door_open.png';
				window.setTimeout(() => {
					placeDoor(false);
					doorLocked = false;
				}, 450);
			}, 3600);
		}

		const endTime = Date.now() + lifetime;
		const expire = setTimeout(() => {
			// not clicked in time
			onEntityMiss(type);
			cleanup();
		}, lifetime);

		function cleanup() {
			el.remove();
			clearTimeout(entityData.expire);
			if (entityData.moveInt) clearInterval(entityData.moveInt);
			if (entityData.doorResetTimer) clearInterval(entityData.doorResetTimer);
			if (entityData.doorReopenTimer) clearTimeout(entityData.doorReopenTimer);
			entities.delete(id);
		}

		// store entity runtime data for pause/resume handling
		const entityData = {
			id,
			el,
			type,
			moveInt,
			doorResetTimer,
			expire,
			endTime,
		};
		entities.set(id, entityData);

		// Accept only mouse pointer interactions — ignore touch/pen
		el.addEventListener('pointerdown', (ev) => {
			if (ev.pointerType !== 'mouse') return;
			ev.stopPropagation();
			if (type === 'door') {
				if (doorLocked) return;
				doorLocked = true;
				onEntityClick(type);
				img.src = 'images/door_open.png';
				clearTimeout(entityData.doorReopenTimer);
				entityData.doorReopenTimer = window.setTimeout(() => {
					if (!entities.has(id)) return;
					placeDoor(false);
					doorLocked = false;
				}, 520);
				return;
			}
			onEntityClick(type);
			cleanup();
		});
	}

	function onEntityClick(type) {
		switch (type) {
			case 'alarm': score += 30; sleepMeter.value = Math.min(sleepMeter.max || 100, Number(sleepMeter.value) + 8); break;
			case 'dog': score += 20; sleepMeter.value = Math.min(sleepMeter.max || 100, Number(sleepMeter.value) + 6); break;
			case 'door': score += 15; sleepMeter.value = Math.min(sleepMeter.max || 100, Number(sleepMeter.value) + 5); break;
			case 'fly': score += 8; sleepMeter.value = Math.min(sleepMeter.max || 100, Number(sleepMeter.value) + 3); break;
			case 'sandman': // clicking sandman is undesirable
				score -= 10;
				sleepMeter.value = Math.max(0, Number(sleepMeter.value) - 8);
				break;
		}
		updateHUD();
	}

	function onEntityMiss(type) {
		switch (type) {
			case 'alarm': sleepMeter.value = Math.max(0, Number(sleepMeter.value) - 22); break;
			case 'dog': sleepMeter.value = Math.max(0, Number(sleepMeter.value) - 15); break;
			case 'door': sleepMeter.value = Math.max(0, Number(sleepMeter.value) - 12); break;
			case 'fly': sleepMeter.value = Math.max(0, Number(sleepMeter.value) - 6); break;
			case 'sandman': // if not clicked, sandman helps deepen sleep
				sleepMeter.value = Math.min(sleepMeter.max || 100, Number(sleepMeter.value) + 18);
				break;
		}
		updateHUD();
	}

	function tick() {
		seconds += 1;
		// decay
		sleepMeter.value = Math.max(0, Number(sleepMeter.value) - config.baseDecay);
		updateHUD();
		if (Number(sleepMeter.value) <= 0) {
			endGame();
		}
	}

	startBtn.addEventListener('click', () => {
			if (running) return;
			running = true;
			startBtn.disabled = true;
			pauseBtn.disabled = false;
			// reset values only when starting a fresh game (not resuming)
			if (!tickInterval && seconds === 0 && score === 0) {
				seconds = 0; score = 0; sleepMeter.value = sleepMeter.max || 100; updateHUD();
			}
			setAlarmState(true);
			tickInterval = setInterval(tick, 1000);
			// slow spawn slightly when bed is present to show distractions appear slower
			const bedPresent = !!document.getElementById('bed');
			const spawnMs = Math.floor(config.spawnRateMs * (bedPresent ? 1.25 : 1));
			spawnInterval = setInterval(spawnEntity, spawnMs);
			// resume entity timers if any (from pause)
			resumeEntities();
	});

	pauseBtn.addEventListener('click', () => {
		if (!running) return;
		running = false;
		startBtn.disabled = false;
		pauseBtn.disabled = true;
		clearInterval(tickInterval);
		clearInterval(spawnInterval);
		tickInterval = null; spawnInterval = null;
		// pause all entity timers and movement
		pauseEntities();
	});

	if (alarmClock) {
		alarmClock.addEventListener('click', () => {
			if (!running) return;
			onEntityClick('alarm');
			setAlarmState(false);
			flashAlarm();
		});
	}

	// clicking empty game area is ignored, but keep handler to prevent accidental score changes
	gameArea.addEventListener('click', (e) => {
		// noop
	});

	// initial HUD
	setAlarmState(true);
	updateHUD();
});
