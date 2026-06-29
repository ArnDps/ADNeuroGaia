const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const metricsEl = document.getElementById('metrics');
const clockEl = document.getElementById('clock');
const climateReadoutEl = document.getElementById('climateReadout');
const toggleRunButton = document.getElementById('toggleRun');
const resetButton = document.getElementById('reset');
const speedInput = document.getElementById('speed');
const climateStressInput = document.getElementById('climateStress');

const world = {
  width: 1280,
  height: 760,
  day: 0,
  tick: 0,
  running: true,
  speed: 1,
  climateStress: 0.45,
  plants: [],
  animals: [],
  particles: [],
  climate: {
    rain: 0.55,
    light: 0.7,
    temperature: 0.62,
    storm: 0,
    drought: 0,
  },
};

const animalProfiles = {
  herbivore: {
    color: '#f0c857',
    radius: 4.4,
    maxSpeed: 1.95,
    metabolism: 0.043,
    plantNutrition: 28,
    meatNutrition: 0,
    attackRange: 0,
    prey: [],
    predatorWeight: 1.25,
    reproductionEnergy: 112,
  },
  carnivore: {
    color: '#f36c5d',
    radius: 5.1,
    maxSpeed: 2.35,
    metabolism: 0.066,
    plantNutrition: 0,
    meatNutrition: 76,
    attackRange: 8.5,
    prey: ['herbivore', 'omnivore'],
    predatorWeight: 0.25,
    reproductionEnergy: 150,
  },
  omnivore: {
    color: '#8fc7ff',
    radius: 4.8,
    maxSpeed: 2.1,
    metabolism: 0.055,
    plantNutrition: 16,
    meatNutrition: 48,
    attackRange: 7,
    prey: ['herbivore'],
    predatorWeight: 0.75,
    reproductionEnergy: 135,
  },
};

class NeuralBrain {
  constructor(inputCount = 10, hiddenCount = 8, outputCount = 4, weights) {
    this.inputCount = inputCount;
    this.hiddenCount = hiddenCount;
    this.outputCount = outputCount;
    this.weights = weights ? weights.slice() : NeuralBrain.randomWeights(inputCount, hiddenCount, outputCount);
  }

  static randomWeights(inputCount, hiddenCount, outputCount) {
    const total = inputCount * hiddenCount + hiddenCount + hiddenCount * outputCount + outputCount;
    return Array.from({ length: total }, () => randomBetween(-1, 1));
  }

  cloneMutated(rate = 0.08, strength = 0.28) {
    const weights = this.weights.map((weight) => {
      if (Math.random() > rate) return weight;
      return clamp(weight + gaussian() * strength, -2.8, 2.8);
    });
    return new NeuralBrain(this.inputCount, this.hiddenCount, this.outputCount, weights);
  }

  think(inputs) {
    const hidden = [];
    let cursor = 0;
    for (let h = 0; h < this.hiddenCount; h += 1) {
      let sum = 0;
      for (let i = 0; i < this.inputCount; i += 1) {
        sum += inputs[i] * this.weights[cursor++];
      }
      sum += this.weights[cursor++];
      hidden.push(Math.tanh(sum));
    }

    const outputs = [];
    for (let o = 0; o < this.outputCount; o += 1) {
      let sum = 0;
      for (let h = 0; h < this.hiddenCount; h += 1) {
        sum += hidden[h] * this.weights[cursor++];
      }
      sum += this.weights[cursor++];
      outputs.push(Math.tanh(sum));
    }
    return outputs;
  }
}

class Plant {
  constructor(x, y, energy = randomBetween(16, 48)) {
    this.x = x;
    this.y = y;
    this.energy = energy;
    this.age = 0;
    this.seedCooldown = randomBetween(40, 220);
    this.fertility = randomBetween(0.7, 1.35);
  }

  update() {
    this.age += 1;
    this.seedCooldown -= 1;
    const c = world.climate;
    const comfort = 1 - Math.abs(c.temperature - 0.56) * 1.1;
    const growth = (0.018 + c.rain * 0.055 + c.light * 0.04) * comfort * this.fertility;
    const stress = c.drought * world.climateStress * 0.11 + c.storm * 0.045;
    this.energy = clamp(this.energy + growth - stress, 0, 80);

    if (this.energy > 48 && this.seedCooldown <= 0 && world.plants.length < 850) {
      this.seedCooldown = randomBetween(120, 360);
      this.energy *= 0.72;
      const distance = randomBetween(9, 46);
      const angle = Math.random() * Math.PI * 2;
      spawnPlant(wrapX(this.x + Math.cos(angle) * distance), wrapY(this.y + Math.sin(angle) * distance), randomBetween(8, 20));
    }
  }
}

class Animal {
  constructor(kind, x, y, brain, generation = 1) {
    const profile = animalProfiles[kind];
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = randomBetween(-1, 1);
    this.vy = randomBetween(-1, 1);
    this.energy = randomBetween(58, 118);
    this.age = 0;
    this.generation = generation;
    this.brain = brain || new NeuralBrain();
    this.radius = profile.radius * randomBetween(0.9, 1.12);
    this.maxSpeed = profile.maxSpeed * randomBetween(0.88, 1.14);
    this.metabolism = profile.metabolism * randomBetween(0.9, 1.2);
    this.reproductionEnergy = profile.reproductionEnergy * randomBetween(0.92, 1.12);
    this.reproductionCooldown = randomBetween(120, 420);
    this.alive = true;
    this.lastMeal = 0;
  }

  update() {
    if (!this.alive) return;
    this.age += 1;
    this.reproductionCooldown -= 1;
    this.lastMeal += 1;

    const perception = perceive(this);
    const outputs = this.brain.think(perception.inputs);
    const turn = outputs[0];
    const thrust = (outputs[1] + 1) * 0.5;
    const caution = (outputs[2] + 1) * 0.5;
    const forageBias = outputs[3];

    const targetAngle = Math.atan2(perception.food.dy, perception.food.dx);
    const dangerAngle = Math.atan2(-perception.danger.dy, -perception.danger.dx);
    const wanderAngle = Math.atan2(this.vy, this.vx) + turn * 0.65 + randomBetween(-0.08, 0.08);
    const foodPull = clamp(0.35 + forageBias * 0.3, 0.05, 0.72) * perception.food.strength;
    const dangerPull = caution * perception.danger.strength * animalProfiles[this.kind].predatorWeight;
    const ax = Math.cos(wanderAngle) * 0.12 + Math.cos(targetAngle) * foodPull * 0.22 + Math.cos(dangerAngle) * dangerPull * 0.32;
    const ay = Math.sin(wanderAngle) * 0.12 + Math.sin(targetAngle) * foodPull * 0.22 + Math.sin(dangerAngle) * dangerPull * 0.32;

    this.vx += ax;
    this.vy += ay;
    const speed = Math.hypot(this.vx, this.vy) || 1;
    const desiredSpeed = this.maxSpeed * (0.38 + thrust * 0.82 + dangerPull * 0.52);
    if (speed > desiredSpeed) {
      this.vx = (this.vx / speed) * desiredSpeed;
      this.vy = (this.vy / speed) * desiredSpeed;
    }

    this.x = wrapX(this.x + this.vx);
    this.y = wrapY(this.y + this.vy);

    this.energy -= this.metabolism * (1 + Math.hypot(this.vx, this.vy) * 0.42 + world.climate.temperature * 0.08);
    this.tryEat(perception);
    this.tryReproduce();

    const oldAgePressure = Math.max(0, this.age - 4500) * 0.00004;
    if (this.energy <= 0 || Math.random() < oldAgePressure) {
      this.die();
    }
  }

  tryEat(perception) {
    const profile = animalProfiles[this.kind];
    if (profile.plantNutrition > 0 && perception.plant && distance(this, perception.plant) < this.radius + 5) {
      const bite = Math.min(perception.plant.energy, 13 + profile.plantNutrition * 0.16);
      perception.plant.energy -= bite;
      this.energy += bite * (profile.plantNutrition / 24);
      this.lastMeal = 0;
      addParticle(this.x, this.y, '#75d65f');
    }

    if (profile.prey.length && perception.prey && distance(this, perception.prey) < profile.attackRange + this.radius) {
      const prey = perception.prey;
      if (prey.alive && Math.random() < 0.84) {
        prey.die(false);
        this.energy += profile.meatNutrition + prey.energy * 0.18;
        this.lastMeal = 0;
        addParticle(this.x, this.y, profile.color);
      }
    }
  }

  tryReproduce() {
    if (this.reproductionCooldown > 0 || this.energy < this.reproductionEnergy || world.animals.length > 380) return;
    const cost = this.energy * 0.42;
    this.energy -= cost;
    this.reproductionCooldown = randomBetween(360, 980);
    const mutationRate = 0.055 + world.climateStress * 0.055 + Math.random() * 0.03;
    const childBrain = this.brain.cloneMutated(mutationRate, 0.22 + world.climateStress * 0.2);
    const child = new Animal(this.kind, wrapX(this.x + randomBetween(-14, 14)), wrapY(this.y + randomBetween(-14, 14)), childBrain, this.generation + 1);
    child.energy = cost * 0.8;

    if (Math.random() < 0.025) {
      child.kind = mutateDiet(this.kind);
    }
    world.animals.push(child);
    addParticle(this.x, this.y, '#f5f0a3');
  }

  die(feedSoil = true) {
    this.alive = false;
    if (feedSoil && world.plants.length < 850) {
      spawnPlant(this.x + randomBetween(-8, 8), this.y + randomBetween(-8, 8), randomBetween(5, 15));
    }
  }
}

function perceive(animal) {
  let nearestPlant = null;
  let nearestPrey = null;
  let nearestDanger = null;
  let plantDistance = Infinity;
  let preyDistance = Infinity;
  let dangerDistance = Infinity;
  const profile = animalProfiles[animal.kind];

  if (profile.plantNutrition > 0) {
    for (const plant of world.plants) {
      const d = torusDistance(animal.x, animal.y, plant.x, plant.y);
      if (d < plantDistance) {
        plantDistance = d;
        nearestPlant = plant;
      }
    }
  }

  for (const other of world.animals) {
    if (other === animal || !other.alive) continue;
    const d = torusDistance(animal.x, animal.y, other.x, other.y);
    if (profile.prey.includes(other.kind) && d < preyDistance) {
      preyDistance = d;
      nearestPrey = other;
    }
    if (animalProfiles[other.kind].prey.includes(animal.kind) && d < dangerDistance) {
      dangerDistance = d;
      nearestDanger = other;
    }
  }

  const foodTarget = chooseFoodTarget(animal, nearestPlant, plantDistance, nearestPrey, preyDistance);
  const foodVector = vectorTo(animal, foodTarget.entity);
  const dangerVector = vectorTo(animal, nearestDanger);
  const foodStrength = foodTarget.entity ? clamp(1 - foodTarget.distance / 260, 0, 1) : 0;
  const dangerStrength = nearestDanger ? clamp(1 - dangerDistance / 220, 0, 1) : 0;

  return {
    plant: nearestPlant,
    prey: nearestPrey,
    food: { dx: foodVector.dx, dy: foodVector.dy, strength: foodStrength },
    danger: { dx: dangerVector.dx, dy: dangerVector.dy, strength: dangerStrength },
    inputs: [
      animal.energy / 160,
      animal.age / 5000,
      world.climate.rain,
      world.climate.light,
      world.climate.temperature,
      world.climate.storm,
      foodVector.dx / world.width,
      foodVector.dy / world.height,
      dangerVector.dx / world.width,
      dangerVector.dy / world.height,
    ],
  };
}

function chooseFoodTarget(animal, plant, plantDistance, prey, preyDistance) {
  const profile = animalProfiles[animal.kind];
  const plantScore = plant ? (profile.plantNutrition / 30) * (1 - clamp(plantDistance / 300, 0, 1)) : -1;
  const preyScore = prey ? (profile.meatNutrition / 80) * (1 - clamp(preyDistance / 320, 0, 1)) : -1;
  if (preyScore > plantScore) return { entity: prey, distance: preyDistance };
  return { entity: plant, distance: plantDistance };
}

function updateClimate() {
  const t = world.tick / 900;
  const season = Math.sin(t * Math.PI * 2);
  const weather = Math.sin(t * 7.1 + 2.4) * 0.5 + Math.sin(t * 2.7) * 0.5;
  const stress = world.climateStress;
  world.climate.light = clamp(0.58 + season * 0.2 - world.climate.storm * 0.28, 0.12, 1);
  world.climate.rain = clamp(0.52 + weather * 0.24 - world.climate.drought * 0.38 + world.climate.storm * 0.2, 0.02, 1);
  world.climate.temperature = clamp(0.54 + season * 0.22 + Math.sin(t * 11.3) * 0.06, 0.05, 0.98);
  world.climate.storm = Math.max(0, world.climate.storm * 0.985 - 0.001);
  world.climate.drought = Math.max(0, world.climate.drought * 0.992 - 0.0006);

  if (Math.random() < 0.0018 * stress) world.climate.storm = randomBetween(0.38, 0.95);
  if (Math.random() < 0.0015 * stress) world.climate.drought = randomBetween(0.35, 0.9);
}

function step() {
  updateClimate();
  for (const plant of world.plants) plant.update();
  world.plants = world.plants.filter((plant) => plant.energy > 0.5 || plant.age < 50);

  for (const animal of world.animals) animal.update();
  world.animals = world.animals.filter((animal) => animal.alive);

  if (world.plants.length < 240) {
    for (let i = 0; i < 5; i += 1) spawnPlant(Math.random() * world.width, Math.random() * world.height, randomBetween(8, 30));
  }
  if (world.animals.length < 24) seedAnimals(8);

  updateParticles();
  world.tick += 1;
  world.day = Math.floor(world.tick / 28);
}

function draw() {
  resizeCanvasToDisplay();
  const scaleX = canvas.width / world.width;
  const scaleY = canvas.height / world.height;
  ctx.save();
  ctx.scale(scaleX, scaleY);

  const c = world.climate;
  const ground = ctx.createLinearGradient(0, 0, world.width, world.height);
  ground.addColorStop(0, mixColor('#102019', '#263322', c.light * 0.5));
  ground.addColorStop(1, mixColor('#07100d', '#173125', c.rain * 0.45));
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, world.width, world.height);

  drawClimateOverlay();
  drawPlants();
  drawAnimals();
  drawParticles();
  ctx.restore();
  updateReadouts();
}

function drawClimateOverlay() {
  const c = world.climate;
  if (c.drought > 0.05) {
    ctx.fillStyle = `rgba(184, 142, 74, ${c.drought * 0.14})`;
    ctx.fillRect(0, 0, world.width, world.height);
  }
  if (c.storm > 0.05) {
    ctx.fillStyle = `rgba(96, 143, 178, ${c.storm * 0.18})`;
    ctx.fillRect(0, 0, world.width, world.height);
    ctx.strokeStyle = `rgba(195, 225, 255, ${c.storm * 0.18})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < c.storm * 24; i += 1) {
      const x = (world.tick * 8 + i * 71) % world.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - 44, world.height);
      ctx.stroke();
    }
  }
}

function drawPlants() {
  for (const plant of world.plants) {
    const size = 1.8 + plant.energy * 0.055;
    ctx.fillStyle = `rgba(112, 208, 91, ${0.45 + plant.energy / 160})`;
    ctx.beginPath();
    ctx.arc(plant.x, plant.y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAnimals() {
  for (const animal of world.animals) {
    const profile = animalProfiles[animal.kind];
    const speed = Math.hypot(animal.vx, animal.vy);
    const angle = Math.atan2(animal.vy, animal.vx);
    const r = animal.radius + clamp(animal.energy / 180, 0, 0.9);
    ctx.save();
    ctx.translate(animal.x, animal.y);
    ctx.rotate(angle);
    ctx.fillStyle = profile.color;
    ctx.globalAlpha = clamp(0.54 + animal.energy / 170, 0.4, 1);
    ctx.beginPath();
    ctx.moveTo(r + speed * 0.8, 0);
    ctx.lineTo(-r * 0.75, r * 0.72);
    ctx.lineTo(-r * 0.48, 0);
    ctx.lineTo(-r * 0.75, -r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.15, -r * 0.18, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of world.particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function updateReadouts() {
  const counts = world.animals.reduce((acc, animal) => {
    acc[animal.kind] = (acc[animal.kind] || 0) + 1;
    acc.maxGeneration = Math.max(acc.maxGeneration, animal.generation);
    return acc;
  }, { herbivore: 0, carnivore: 0, omnivore: 0, maxGeneration: 1 });
  const biomass = Math.round(world.plants.reduce((sum, plant) => sum + plant.energy, 0));

  clockEl.textContent = `jour ${world.day}`;
  climateReadoutEl.textContent = `pluie ${percent(world.climate.rain)} | lumiere ${percent(world.climate.light)} | temp ${percent(world.climate.temperature)}`;
  metricsEl.innerHTML = [
    metric('Plantes', world.plants.length),
    metric('Biomasse', biomass),
    metric('Herbivores', counts.herbivore),
    metric('Carnivores', counts.carnivore),
    metric('Omnivores', counts.omnivore),
    metric('Generation max', counts.maxGeneration),
  ].join('');
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function updateParticles() {
  for (const p of world.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
    p.radius *= 0.985;
  }
  world.particles = world.particles.filter((p) => p.life > 0);
}

function addParticle(x, y, color) {
  for (let i = 0; i < 5; i += 1) {
    world.particles.push({
      x,
      y,
      vx: randomBetween(-0.6, 0.6),
      vy: randomBetween(-0.6, 0.6),
      radius: randomBetween(1.5, 3.5),
      color,
      life: randomBetween(24, 52),
      maxLife: 52,
    });
  }
}

function spawnPlant(x, y, energy) {
  world.plants.push(new Plant(wrapX(x), wrapY(y), energy));
}

function seedAnimals(countMultiplier = 1) {
  for (let i = 0; i < 34 * countMultiplier; i += 1) world.animals.push(new Animal('herbivore', Math.random() * world.width, Math.random() * world.height));
  for (let i = 0; i < 8 * countMultiplier; i += 1) world.animals.push(new Animal('carnivore', Math.random() * world.width, Math.random() * world.height));
  for (let i = 0; i < 10 * countMultiplier; i += 1) world.animals.push(new Animal('omnivore', Math.random() * world.width, Math.random() * world.height));
}

function resetWorld() {
  world.day = 0;
  world.tick = 0;
  world.plants = [];
  world.animals = [];
  world.particles = [];
  world.climate = { rain: 0.55, light: 0.7, temperature: 0.62, storm: 0, drought: 0 };
  for (let i = 0; i < 430; i += 1) spawnPlant(Math.random() * world.width, Math.random() * world.height, randomBetween(10, 58));
  seedAnimals(1);
}

function animationLoop() {
  if (world.running) {
    const iterations = Math.max(1, Math.round(world.speed));
    for (let i = 0; i < iterations; i += 1) step();
  }
  draw();
  requestAnimationFrame(animationLoop);
}

function resizeCanvasToDisplay() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(canvas.clientWidth * ratio);
  const height = Math.floor(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function vectorTo(from, to) {
  if (!to) return { dx: 0, dy: 0 };
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (Math.abs(dx) > world.width / 2) dx -= Math.sign(dx) * world.width;
  if (Math.abs(dy) > world.height / 2) dy -= Math.sign(dy) * world.height;
  return { dx, dy };
}

function distance(a, b) {
  return torusDistance(a.x, a.y, b.x, b.y);
}

function torusDistance(ax, ay, bx, by) {
  const dx = Math.min(Math.abs(ax - bx), world.width - Math.abs(ax - bx));
  const dy = Math.min(Math.abs(ay - by), world.height - Math.abs(ay - by));
  return Math.hypot(dx, dy);
}

function mutateDiet(kind) {
  if (kind === 'herbivore') return Math.random() < 0.55 ? 'omnivore' : 'herbivore';
  if (kind === 'carnivore') return Math.random() < 0.4 ? 'omnivore' : 'carnivore';
  return Math.random() < 0.5 ? 'herbivore' : 'carnivore';
}

function wrapX(x) {
  return (x + world.width) % world.width;
}

function wrapY(y) {
  return (y + world.height) % world.height;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function mixColor(a, b, amount) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const c = ca.map((channel, index) => Math.round(channel + (cb[index] - channel) * amount));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function parseHex(hex) {
  const raw = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16));
}

toggleRunButton.addEventListener('click', () => {
  world.running = !world.running;
  toggleRunButton.textContent = world.running ? 'Pause' : 'Reprendre';
});

resetButton.addEventListener('click', resetWorld);
speedInput.addEventListener('input', () => {
  world.speed = Number(speedInput.value);
});
climateStressInput.addEventListener('input', () => {
  world.climateStress = Number(climateStressInput.value);
});

resetWorld();
animationLoop();
