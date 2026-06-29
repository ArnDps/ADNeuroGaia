const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const metricsEl = document.getElementById('metrics');
const clockEl = document.getElementById('clock');
const climateReadoutEl = document.getElementById('climateReadout');
const toggleRunButton = document.getElementById('toggleRun');
const resetButton = document.getElementById('reset');
const speedInput = document.getElementById('speed');
const speedValueEl = document.getElementById('speedValue');
const climateStressInput = document.getElementById('climateStress');
const endModeInput = document.getElementById('endMode');
const scenarioStatusEl = document.getElementById('scenarioStatus');
const targetGenerationInput = document.getElementById('targetGeneration');
const targetGenerationValueEl = document.getElementById('targetGenerationValue');
const brainCanvas = document.getElementById('brain');
const brainCtx = brainCanvas.getContext('2d');
const selectedBadgeEl = document.getElementById('selectedBadge');
const selectedStatsEl = document.getElementById('selectedStats');
const mutationBadgeEl = document.getElementById('mutationBadge');
const lineageBadgeEl = document.getElementById('lineageBadge');
const lineageListEl = document.getElementById('lineageList');

const inputLabels = ['energie', 'age', 'pluie', 'lumiere', 'temp', 'orage', 'nour. x', 'nour. y', 'danger x', 'danger y'];
const outputLabels = ['tourner', 'vitesse', 'prudence', 'regime'];
let nextAnimalId = 1;

const endModeLabels = {
  sandbox: 'bac a sable',
  extinction: 'extinction totale',
  equilibrium: 'equilibre stable',
  climateCollapse: 'catastrophe climatique',
  generationGoal: 'objectif generation',
};

const world = {
  width: 1280,
  height: 760,
  day: 0,
  tick: 0,
  running: true,
  speed: 1,
  stepBudget: 0,
  climateStress: 0.45,
  endMode: 'sandbox',
  targetGeneration: 12,
  ended: false,
  endReason: '',
  populationHistory: [],
  collapseStarted: false,
  collapseStartTick: 0,
  plants: [],
  animals: [],
  particles: [],
  genealogyRecords: new Map(),
  selectedAnimalId: null,
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
    this.lastInputs = Array.from({ length: inputCount }, () => 0);
    this.lastHidden = Array.from({ length: hiddenCount }, () => 0);
    this.lastOutputs = Array.from({ length: outputCount }, () => 0);
  }

  static randomWeights(inputCount, hiddenCount, outputCount) {
    const total = inputCount * hiddenCount + hiddenCount + hiddenCount * outputCount + outputCount;
    return Array.from({ length: total }, () => randomBetween(-1, 1));
  }

  cloneMutated(rate = 0.08, strength = 0.28) {
    let mutationCount = 0;
    let totalShift = 0;
    const weights = this.weights.map((weight) => {
      if (Math.random() > rate) return weight;
      const nextWeight = clamp(weight + gaussian() * strength, -2.8, 2.8);
      mutationCount += 1;
      totalShift += Math.abs(nextWeight - weight);
      return nextWeight;
    });
    return {
      brain: new NeuralBrain(this.inputCount, this.hiddenCount, this.outputCount, weights),
      mutationCount,
      averageShift: mutationCount ? totalShift / mutationCount : 0,
    };
  }

  think(inputs) {
    this.lastInputs = inputs.slice();
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
    this.lastHidden = hidden.slice();

    const outputs = [];
    for (let o = 0; o < this.outputCount; o += 1) {
      let sum = 0;
      for (let h = 0; h < this.hiddenCount; h += 1) {
        sum += hidden[h] * this.weights[cursor++];
      }
      sum += this.weights[cursor++];
      outputs.push(Math.tanh(sum));
    }
    this.lastOutputs = outputs.slice();
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
  constructor(kind, x, y, brain, generation = 1, lineage = [], defenseTraits) {
    const profile = animalProfiles[kind];
    this.id = nextAnimalId;
    nextAnimalId += 1;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = randomBetween(-1, 1);
    this.vy = randomBetween(-1, 1);
    this.energy = randomBetween(58, 118);
    this.age = 0;
    this.generation = generation;
    this.brain = brain || new NeuralBrain();
    this.defenseTraits = normalizeDefenseTraits(kind, defenseTraits);
    this.birthTick = world.tick;
    this.parentId = lineage.length ? lineage[lineage.length - 1].id : null;
    this.mutationCount = 0;
    this.totalMutations = lineage.length ? lineage[lineage.length - 1].totalMutations : 0;
    this.lastMutationShift = 0;
    this.lineage = lineage.length ? lineage.slice(-7) : [{
      id: this.id,
      generation: this.generation,
      kind: this.kind,
      mutationCount: 0,
      totalMutations: 0,
    }];
    this.radius = profile.radius * randomBetween(0.9, 1.12);
    this.maxSpeed = profile.maxSpeed * randomBetween(0.88, 1.14) * (1 - this.defenseTraits.armor * 0.12);
    this.metabolism = profile.metabolism * randomBetween(0.9, 1.2) * (1 + this.defenseTraits.armor * 0.16 + this.defenseTraits.camouflage * 0.06 + this.defenseTraits.cannibalism * 0.08);
    this.reproductionEnergy = profile.reproductionEnergy * randomBetween(0.92, 1.12) * (1 + this.defenseTraits.cannibalism * 0.1);
    this.reproductionCooldown = randomBetween(120, 420);
    this.alive = true;
    this.lastMeal = 0;
    registerAnimalRecord(this);
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
    const herdPull = this.kind === 'herbivore' ? this.defenseTraits.gregariousness * perception.herd.strength : 0;
    const ax = Math.cos(wanderAngle) * 0.12 + Math.cos(targetAngle) * foodPull * 0.22 + Math.cos(dangerAngle) * dangerPull * 0.32 + perception.herd.dx * herdPull * 0.0018;
    const ay = Math.sin(wanderAngle) * 0.12 + Math.sin(targetAngle) * foodPull * 0.22 + Math.sin(dangerAngle) * dangerPull * 0.32 + perception.herd.dy * herdPull * 0.0018;

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
      this.energy += bite * (profile.plantNutrition / 24) * (1 + this.defenseTraits.energyAbsorption * 0.42);
      this.lastMeal = 0;
      addParticle(this.x, this.y, '#75d65f');
    }

    if (profile.prey.length && perception.prey && distance(this, perception.prey) < profile.attackRange + this.radius) {
      const prey = perception.prey;
      const defense = preyDefenseScore(prey);
      const cannibalAttack = this.kind === 'carnivore' && prey.kind === 'carnivore';
      const captureChance = cannibalAttack
        ? clamp(0.46 + this.defenseTraits.cannibalism * 0.28 - defense * 0.22, 0.12, 0.68)
        : clamp(0.84 - defense * 0.62, 0.12, 0.9);
      if (prey.alive && Math.random() < captureChance) {
        prey.die(false);
        this.energy += profile.meatNutrition * (cannibalAttack ? 0.78 : 1) + prey.energy * 0.18;
        this.lastMeal = 0;
        addParticle(this.x, this.y, profile.color);
      } else if (prey.alive) {
        prey.energy -= Math.max(0.2, prey.defenseTraits.armor * 0.8);
        if (cannibalAttack) {
          this.energy -= 7 + prey.energy * 0.04;
        }
        prey.vx += randomBetween(-1.2, 1.2);
        prey.vy += randomBetween(-1.2, 1.2);
        addParticle(prey.x, prey.y, '#d8f3b5');
      }
    }
  }

  tryReproduce() {
    if (this.reproductionCooldown > 0 || this.energy < this.reproductionEnergy || world.animals.length > 380) return;
    const cost = this.energy * 0.42;
    this.energy -= cost;
    this.reproductionCooldown = randomBetween(360, 980);
    const mutationRate = 0.055 + world.climateStress * 0.055 + Math.random() * 0.03;
    const mutation = this.brain.cloneMutated(mutationRate, 0.22 + world.climateStress * 0.2);
    const inheritedDefense = mutateDefenseTraits(this.kind, this.defenseTraits, mutationRate);
    const inheritedLineage = this.lineage.slice();
    const child = new Animal(this.kind, wrapX(this.x + randomBetween(-14, 14)), wrapY(this.y + randomBetween(-14, 14)), mutation.brain, this.generation + 1, inheritedLineage, inheritedDefense.traits);
    child.energy = cost * 0.8;
    child.parentId = this.id;
    child.mutationCount = mutation.mutationCount + inheritedDefense.mutationCount;
    child.totalMutations = this.totalMutations + child.mutationCount;
    child.lastMutationShift = mutation.averageShift;

    if (Math.random() < 0.025) {
      child.kind = mutateDiet(this.kind);
      if (child.kind === 'herbivore' && this.kind !== 'herbivore') {
        child.defenseTraits = createDefenseTraits('herbivore');
      }
      if (child.kind === 'carnivore' && this.kind !== 'carnivore') {
        child.defenseTraits = createDefenseTraits('carnivore');
      }
    }
    refreshAnimalRecord(child);
    child.lineage = child.lineage.concat({
      id: child.id,
      generation: child.generation,
      kind: child.kind,
      mutationCount: child.mutationCount,
      totalMutations: child.totalMutations,
    }).slice(-8);
    world.animals.push(child);
    addParticle(this.x, this.y, '#f5f0a3');
  }

  die(feedSoil = true) {
    this.alive = false;
    markAnimalDead(this);
    if (feedSoil && world.plants.length < 850) {
      spawnPlant(this.x + randomBetween(-8, 8), this.y + randomBetween(-8, 8), randomBetween(5, 15));
    }
  }
}

function registerAnimalRecord(animal) {
  const existing = world.genealogyRecords.get(animal.id);
  const record = {
    id: animal.id,
    kind: animal.kind,
    generation: animal.generation,
    parentId: animal.parentId,
    childrenIds: existing?.childrenIds || [],
    mutationCount: animal.mutationCount,
    totalMutations: animal.totalMutations,
    lastMutationShift: animal.lastMutationShift,
    birthDay: Math.floor(animal.birthTick / 28),
    deathDay: existing?.deathDay ?? null,
    alive: animal.alive,
    traits: { ...animal.defenseTraits },
  };
  world.genealogyRecords.set(animal.id, record);

  if (record.parentId) {
    const parent = world.genealogyRecords.get(record.parentId);
    if (parent && !parent.childrenIds.includes(record.id)) {
      parent.childrenIds.push(record.id);
    }
  }
}

function refreshAnimalRecord(animal) {
  registerAnimalRecord(animal);
}

function markAnimalDead(animal) {
  const record = world.genealogyRecords.get(animal.id);
  if (!record) return;
  record.alive = false;
  record.deathDay = world.day;
}

function getAnimalRecord(id) {
  return world.genealogyRecords.get(id) || null;
}

function getSelectedRecord() {
  return getAnimalRecord(world.selectedAnimalId);
}

function getAncestorPath(record) {
  const path = [];
  let cursor = record;
  const visited = new Set();
  while (cursor && !visited.has(cursor.id)) {
    path.unshift(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? getAnimalRecord(cursor.parentId) : null;
  }
  return path;
}

function traitDeltaSummary(record) {
  const parent = record.parentId ? getAnimalRecord(record.parentId) : null;
  if (!parent) return 'racine';
  const keys = ['camouflage', 'armor', 'energyAbsorption', 'gregariousness', 'cannibalism'];
  const deltas = keys
    .map((key) => ({ key, delta: (record.traits[key] || 0) - (parent.traits[key] || 0) }))
    .filter((entry) => Math.abs(entry.delta) >= 0.015)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 2);
  if (!deltas.length) return '+0 trait';
  return deltas.map((entry) => `${traitShortLabel(entry.key)} ${entry.delta >= 0 ? '+' : ''}${Math.round(entry.delta * 100)}%`).join(', ');
}

function traitShortLabel(key) {
  return {
    camouflage: 'cam',
    armor: 'arm',
    energyAbsorption: 'abs',
    gregariousness: 'grp',
    cannibalism: 'can',
  }[key] || key;
}

function createDefenseTraits(kind) {
  if (kind === 'carnivore') {
    return { camouflage: 0, armor: 0, energyAbsorption: 0, gregariousness: 0, cannibalism: randomBetween(0.02, 0.18) };
  }
  if (kind !== 'herbivore') {
    return { camouflage: 0, armor: 0, energyAbsorption: 0, gregariousness: 0, cannibalism: 0 };
  }
  return {
    camouflage: randomBetween(0.08, 0.32),
    armor: randomBetween(0.04, 0.24),
    energyAbsorption: randomBetween(0.12, 0.38),
    gregariousness: randomBetween(0.1, 0.34),
    cannibalism: 0,
  };
}

function mutateDefenseTraits(kind, traits, rate) {
  const next = normalizeDefenseTraits(kind, traits);
  let mutationCount = 0;
  if (kind !== 'herbivore' && kind !== 'carnivore') return { traits: next, mutationCount };

  const mutableTraits = kind === 'carnivore' ? ['cannibalism'] : ['camouflage', 'armor', 'energyAbsorption', 'gregariousness'];
  for (const key of mutableTraits) {
    if (Math.random() < rate * 2.6) {
      next[key] = clamp(next[key] + gaussian() * 0.11, 0, 1);
      mutationCount += 1;
    }
  }
  return { traits: next, mutationCount };
}

function normalizeDefenseTraits(kind, traits = {}) {
  const base = createDefenseTraits(kind);
  return {
    camouflage: traits.camouflage ?? base.camouflage,
    armor: traits.armor ?? base.armor,
    energyAbsorption: traits.energyAbsorption ?? base.energyAbsorption,
    gregariousness: traits.gregariousness ?? base.gregariousness,
    cannibalism: traits.cannibalism ?? base.cannibalism,
  };
}

function preyVisibility(prey) {
  if (prey.kind !== 'herbivore') return 1;
  const herdReveal = herdDefenseBonus(prey) * 0.18;
  return clamp(1 - prey.defenseTraits.camouflage * 0.58 + herdReveal, 0.32, 1);
}

function preyDefenseScore(prey) {
  if (prey.kind !== 'herbivore') return 0;
  const traits = prey.defenseTraits;
  return clamp(
    traits.camouflage * 0.34 +
    traits.armor * 0.36 +
    traits.energyAbsorption * 0.08 +
    herdDefenseBonus(prey) * 0.42,
    0,
    1
  );
}

function herdDefenseBonus(animal) {
  if (animal.kind !== 'herbivore') return 0;
  let allies = 0;
  for (const other of world.animals) {
    if (other === animal || other.kind !== 'herbivore' || !other.alive) continue;
    if (torusDistance(animal.x, animal.y, other.x, other.y) < 70) allies += 1;
  }
  return clamp((allies / 7) * animal.defenseTraits.gregariousness, 0, 1);
}

function perceive(animal) {
  let nearestPlant = null;
  let nearestPrey = null;
  let nearestDanger = null;
  let plantDistance = Infinity;
  let preyDistance = Infinity;
  let dangerDistance = Infinity;
  let herdX = 0;
  let herdY = 0;
  let herdCount = 0;
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
    const canHunt = canHuntPrey(animal, other);
    const visibleDistance = canHunt ? d / preyVisibility(other) : d;
    if (canHunt && visibleDistance < preyDistance) {
      preyDistance = visibleDistance;
      nearestPrey = other;
    }
    if (animalProfiles[other.kind].prey.includes(animal.kind) && d < dangerDistance) {
      dangerDistance = d;
      nearestDanger = other;
    }
    if (animal.kind === 'herbivore' && other.kind === 'herbivore' && d < 120) {
      const vector = vectorTo(animal, other);
      herdX += vector.dx;
      herdY += vector.dy;
      herdCount += 1;
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
    herd: {
      dx: herdCount ? herdX / herdCount : 0,
      dy: herdCount ? herdY / herdCount : 0,
      strength: clamp(herdCount / 8, 0, 1),
    },
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
  let preyScore = prey ? (profile.meatNutrition / 80) * (1 - clamp(preyDistance / 320, 0, 1)) : -1;
  if (prey && animal.kind === 'carnivore' && prey.kind === 'carnivore') {
    preyScore *= cannibalDrive(animal);
  }
  if (preyScore > plantScore) return { entity: prey, distance: preyDistance };
  return { entity: plant, distance: plantDistance };
}

function canHuntPrey(hunter, prey) {
  const profile = animalProfiles[hunter.kind];
  if (profile.prey.includes(prey.kind)) return true;
  return hunter.kind === 'carnivore' && prey.kind === 'carnivore' && cannibalDrive(hunter) > 0.22;
}

function cannibalDrive(animal) {
  if (animal.kind !== 'carnivore') return 0;
  const hunger = clamp(1 - animal.energy / Math.max(1, animal.reproductionEnergy), 0, 1);
  return clamp(animal.defenseTraits.cannibalism * (0.35 + hunger * 1.25), 0, 1);
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
  applyScenarioClimate();
}

function step() {
  updateClimate();
  for (const plant of world.plants) plant.update();
  world.plants = world.plants.filter((plant) => plant.energy > 0.5 || plant.age < 50);

  for (const animal of world.animals) animal.update();
  world.animals = world.animals.filter((animal) => animal.alive);

  if (shouldAutoSeedPlants() && world.plants.length < 240) {
    for (let i = 0; i < 5; i += 1) spawnPlant(Math.random() * world.width, Math.random() * world.height, randomBetween(8, 30));
  }
  if (shouldAutoSeedAnimals() && world.animals.length < 24) seedAnimals(8);

  updateParticles();
  world.tick += 1;
  world.day = Math.floor(world.tick / 28);
  evaluateEndConditions();
}

function shouldAutoSeedPlants() {
  return world.endMode === 'sandbox' || world.endMode === 'generationGoal' || world.endMode === 'equilibrium';
}

function shouldAutoSeedAnimals() {
  return world.endMode === 'sandbox' || world.endMode === 'generationGoal';
}

function applyScenarioClimate() {
  if (world.endMode !== 'climateCollapse') return;
  if (!world.collapseStarted && world.day >= 30) {
    world.collapseStarted = true;
    world.collapseStartTick = world.tick;
  }
  if (!world.collapseStarted) return;

  const collapseAge = Math.max(0, world.tick - world.collapseStartTick);
  const pressure = clamp(collapseAge / 1500, 0, 1);
  world.climate.drought = clamp(Math.max(world.climate.drought, 0.45 + pressure * 0.55), 0, 1);
  world.climate.storm = clamp(Math.max(world.climate.storm, 0.22 + Math.sin(world.tick * 0.045) * 0.2 + pressure * 0.35), 0, 1);
  world.climate.light = clamp(world.climate.light * (1 - pressure * 0.55), 0.02, 1);
  world.climate.rain = clamp(world.climate.rain * (1 - pressure * 0.82), 0, 1);
  world.climate.temperature = clamp(0.72 + pressure * 0.26, 0, 1);
}

function evaluateEndConditions() {
  if (world.ended || world.endMode === 'sandbox') return;

  const counts = getPopulationCounts();
  const totalAnimals = counts.herbivore + counts.carnivore + counts.omnivore;
  const totalLife = totalAnimals + world.plants.length;

  if (world.endMode === 'extinction' && totalLife === 0) {
    finishScenario('Extinction totale atteinte');
    return;
  }

  if (world.endMode === 'extinction' && (totalAnimals === 0 || world.plants.length === 0)) {
    finishScenario(totalAnimals === 0 ? 'Extinction animale totale' : 'Extinction vegetale totale');
    return;
  }

  if (world.endMode === 'climateCollapse') {
    if (world.collapseStarted && totalAnimals === 0) {
      finishScenario('Catastrophe fatale: aucun animal survivant');
    }
    return;
  }

  if (world.endMode === 'generationGoal' && counts.maxGeneration >= world.targetGeneration) {
    finishScenario(`Objectif atteint: generation ${counts.maxGeneration}`);
    return;
  }

  if (world.endMode === 'equilibrium') {
    const sample = {
      tick: world.tick,
      plants: world.plants.length,
      animals: totalAnimals,
      herbivore: counts.herbivore,
      carnivore: counts.carnivore,
      omnivore: counts.omnivore,
    };
    world.populationHistory.push(sample);
    world.populationHistory = world.populationHistory.filter((entry) => world.tick - entry.tick <= 1800);
    if (world.tick > 2200 && world.populationHistory.length > 40 && isStableEquilibrium(world.populationHistory)) {
      finishScenario('Equilibre stable detecte');
    }
  }
}

function isStableEquilibrium(history) {
  const first = history[0];
  const last = history[history.length - 1];
  const plantDrift = relativeDrift(first.plants, last.plants);
  const animalDrift = relativeDrift(first.animals, last.animals);
  const hasPredatorsAndPrey = last.herbivore > 10 && (last.carnivore + last.omnivore) > 4;
  const enoughLife = last.plants > 220 && last.animals > 35;
  return enoughLife && hasPredatorsAndPrey && plantDrift < 0.16 && animalDrift < 0.18;
}

function relativeDrift(a, b) {
  return Math.abs(a - b) / Math.max(1, (a + b) / 2);
}

function finishScenario(reason) {
  world.ended = true;
  world.running = false;
  world.endReason = reason;
  toggleRunButton.textContent = 'Reprendre';
}

function getPopulationCounts() {
  return world.animals.reduce((acc, animal) => {
    acc[animal.kind] = (acc[animal.kind] || 0) + 1;
    acc.maxGeneration = Math.max(acc.maxGeneration, animal.generation);
    return acc;
  }, { herbivore: 0, carnivore: 0, omnivore: 0, maxGeneration: 1 });
}

function getScenarioStatus(counts) {
  if (world.endMode === 'sandbox') return endModeLabels.sandbox;
  if (world.endMode === 'generationGoal') return `generation ${counts.maxGeneration}/${world.targetGeneration}`;
  if (world.endMode === 'climateCollapse') {
    return world.collapseStarted ? 'effondrement en cours' : `catastrophe a J30`;
  }
  if (world.endMode === 'equilibrium') {
    const progress = Math.min(100, Math.round((world.populationHistory.length / 40) * 100));
    return `stabilite ${progress}%`;
  }
  return endModeLabels[world.endMode] || 'scenario';
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
  drawEndOverlay();
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
    const traits = animal.defenseTraits;
    const speed = Math.hypot(animal.vx, animal.vy);
    const angle = Math.atan2(animal.vy, animal.vx);
    const r = animal.radius + clamp(animal.energy / 180, 0, 0.9);
    if (animal.kind === 'herbivore' && traits.gregariousness > 0.55) {
      ctx.save();
      ctx.translate(animal.x, animal.y);
      ctx.strokeStyle = `rgba(240, 200, 87, ${0.08 + traits.gregariousness * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + traits.gregariousness * 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (animal.kind === 'carnivore' && traits.cannibalism > 0.45) {
      ctx.save();
      ctx.translate(animal.x, animal.y);
      ctx.strokeStyle = `rgba(180, 40, 58, ${0.18 + traits.cannibalism * 0.28})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 12 + traits.cannibalism * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (animal.id === world.selectedAnimalId) {
      ctx.save();
      ctx.translate(animal.x, animal.y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r + 8 + Math.sin(world.tick * 0.14) * 1.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = profile.color;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(animal.x, animal.y);
    ctx.rotate(angle);
    ctx.fillStyle = animal.kind === 'herbivore'
      ? mixColor(profile.color, '#6a9d61', traits.camouflage * 0.75)
      : profile.color;
    ctx.globalAlpha = animal.kind === 'herbivore'
      ? clamp(0.46 + animal.energy / 190 - traits.camouflage * 0.18, 0.32, 0.95)
      : clamp(0.54 + animal.energy / 170, 0.4, 1);
    ctx.beginPath();
    ctx.moveTo(r + speed * 0.8, 0);
    ctx.lineTo(-r * 0.75, r * 0.72);
    ctx.lineTo(-r * 0.48, 0);
    ctx.lineTo(-r * 0.75, -r * 0.72);
    ctx.closePath();
    ctx.fill();
    if (animal.kind === 'herbivore' && traits.armor > 0.35) {
      ctx.strokeStyle = `rgba(238, 247, 239, ${0.18 + traits.armor * 0.42})`;
      ctx.lineWidth = 0.8 + traits.armor * 1.8;
      ctx.stroke();
    }
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

function drawEndOverlay() {
  if (!world.ended) return;
  ctx.save();
  ctx.fillStyle = 'rgba(4, 8, 7, 0.62)';
  ctx.fillRect(0, 0, world.width, world.height);
  ctx.fillStyle = 'rgba(238, 247, 239, 0.94)';
  ctx.textAlign = 'center';
  ctx.font = '34px Segoe UI, sans-serif';
  ctx.fillText('Simulation terminee', world.width / 2, world.height / 2 - 18);
  ctx.fillStyle = 'rgba(238, 247, 239, 0.7)';
  ctx.font = '17px Segoe UI, sans-serif';
  ctx.fillText(world.endReason, world.width / 2, world.height / 2 + 18);
  ctx.restore();
}

function updateReadouts() {
  const counts = getPopulationCounts();
  const biomass = Math.round(world.plants.reduce((sum, plant) => sum + plant.energy, 0));

  clockEl.textContent = `jour ${world.day}`;
  climateReadoutEl.textContent = `pluie ${percent(world.climate.rain)} | lumiere ${percent(world.climate.light)} | temp ${percent(world.climate.temperature)}`;
  scenarioStatusEl.textContent = world.ended ? world.endReason : getScenarioStatus(counts);
  targetGenerationValueEl.textContent = String(world.targetGeneration);
  metricsEl.innerHTML = [
    metric('Plantes', world.plants.length),
    metric('Biomasse', biomass),
    metric('Herbivores', counts.herbivore),
    metric('Carnivores', counts.carnivore),
    metric('Omnivores', counts.omnivore),
    metric('Generation max', counts.maxGeneration),
  ].join('');
  updateSelectionPanel();
  drawSelectedBrain();
}

function metric(label, value) {
  return `<article class="metric"><span>${label}</span><strong>${value}</strong></article>`;
}

function updateSelectionPanel() {
  const animal = getSelectedAnimal();
  const record = animal ? getAnimalRecord(animal.id) : getSelectedRecord();
  if (!record) {
    selectedBadgeEl.textContent = 'clique un animal';
    mutationBadgeEl.textContent = '0 mutations';
    lineageBadgeEl.textContent = 'generation 0';
    selectedStatsEl.innerHTML = [
      selectedStat('Type', '-'),
      selectedStat('Energie', '-'),
      selectedStat('Age', '-'),
      selectedStat('Parent', '-'),
    ].join('');
    lineageListEl.innerHTML = '<div class="lineage-item"><strong>-</strong><span class="lineage-kind">aucune selection</span><span>-</span></div>';
    return;
  }

  const traits = animal?.defenseTraits || record.traits;
  const status = animal ? 'vivant' : `mort J${record.deathDay ?? '?'}`;
  selectedBadgeEl.textContent = `#${record.id} ${record.kind} - ${status}`;
  mutationBadgeEl.textContent = `${record.totalMutations} mutations`;
  lineageBadgeEl.textContent = `G${record.generation} | ${record.childrenIds.length} enfant(s)`;
  selectedStatsEl.innerHTML = [
    selectedStat('Type', record.kind),
    selectedStat('Etat', status),
    selectedStat('Energie', animal ? Math.round(animal.energy) : '-'),
    selectedStat('Age', animal ? `${Math.floor((world.tick - animal.birthTick) / 28)} j` : `J${record.birthDay}-${record.deathDay ?? '?'}`),
    selectedStat('Parent', record.parentId ? `#${record.parentId}` : '-'),
    selectedStat('Mutation', record.mutationCount),
    selectedStat('Delta traits', traitDeltaSummary(record)),
    selectedStat('Camouflage', traitPercent(traits.camouflage)),
    selectedStat('Armure', traitPercent(traits.armor)),
    selectedStat('Absorption', traitPercent(traits.energyAbsorption)),
    selectedStat('Groupe', traitPercent(traits.gregariousness)),
    selectedStat('Cannibalisme', traitPercent(traits.cannibalism)),
  ].join('');
  lineageListEl.innerHTML = renderGenealogyTree(record);
}

function selectedStat(label, value) {
  return `<article class="selected-stat"><span>${label}</span><strong>${value}</strong></article>`;
}

function traitPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function renderGenealogyTree(record) {
  const ancestors = getAncestorPath(record);
  const children = record.childrenIds
    .map((id) => getAnimalRecord(id))
    .filter(Boolean)
    .sort((a, b) => a.generation - b.generation || a.id - b.id);

  const ancestorRows = ancestors.map((entry) => genealogyButton(entry, entry.id === record.id ? 'current' : 'ancestor')).join('');
  const childRows = children.length
    ? children.map((entry) => genealogyButton(entry, 'child')).join('')
    : '<div class="genealogy-empty">Aucun descendant connu pour le moment.</div>';

  return `
    <div class="genealogy-section">
      <span class="genealogy-heading">Ancetres</span>
      ${ancestorRows}
    </div>
    <div class="genealogy-section">
      <span class="genealogy-heading">Descendants directs</span>
      ${childRows}
    </div>
  `;
}

function genealogyButton(record, role) {
  const color = animalProfiles[record.kind]?.color || '#eef7ef';
  const state = record.alive ? 'Vivant' : `Mort J${record.deathDay ?? '?'}`;
  const stateClass = record.alive ? 'alive' : 'dead';
  const active = role === 'current' ? ' active' : '';
  return `
    <button class="genealogy-node${active}" type="button" data-select-id="${record.id}">
      <strong>G${record.generation}</strong>
      <span class="lineage-kind" style="color: ${color}">${record.kind} #${record.id}</span>
      <span class="genealogy-state ${stateClass}">${state}</span>
      <small>+${record.mutationCount} mutation(s) | ${traitDeltaSummary(record)}</small>
    </button>
  `;
}

function drawSelectedBrain() {
  resizeBrainCanvas();
  const animal = getSelectedAnimal();
  const record = animal ? null : getSelectedRecord();
  brainCtx.clearRect(0, 0, brainCanvas.width, brainCanvas.height);
  brainCtx.fillStyle = '#0a1211';
  brainCtx.fillRect(0, 0, brainCanvas.width, brainCanvas.height);

  if (!animal) {
    brainCtx.fillStyle = 'rgba(238, 247, 239, 0.58)';
    brainCtx.font = '13px Segoe UI, sans-serif';
    brainCtx.textAlign = 'center';
    if (record) {
      brainCtx.fillText(`Individu #${record.id} archive`, brainCanvas.width / 2, brainCanvas.height / 2 - 4);
      brainCtx.fillText('cerveau dynamique indisponible', brainCanvas.width / 2, brainCanvas.height / 2 + 16);
    } else {
      brainCtx.fillText('Clique sur un animal', brainCanvas.width / 2, brainCanvas.height / 2 - 4);
      brainCtx.fillText('pour inspecter son cerveau', brainCanvas.width / 2, brainCanvas.height / 2 + 16);
    }
    return;
  }

  const brain = animal.brain;
  const padding = 26;
  const columns = [
    buildNeuronColumn(brain.lastInputs, padding, inputLabels),
    buildNeuronColumn(brain.lastHidden, brainCanvas.width * 0.5, null),
    buildNeuronColumn(brain.lastOutputs, brainCanvas.width - padding, outputLabels),
  ];

  drawBrainConnections(brain, columns);
  drawBrainNeurons(columns, animalProfiles[animal.kind].color);
}

function buildNeuronColumn(values, x, labels) {
  const top = 18;
  const bottom = brainCanvas.height - 20;
  const span = bottom - top;
  return values.map((value, index) => ({
    x,
    y: values.length === 1 ? brainCanvas.height / 2 : top + (span * index) / (values.length - 1),
    value,
    label: labels ? labels[index] : '',
  }));
}

function drawBrainConnections(brain, columns) {
  let cursor = 0;
  drawWeightBlock(columns[0], columns[1], brain.weights, cursor);
  cursor += brain.inputCount * brain.hiddenCount + brain.hiddenCount;
  drawWeightBlock(columns[1], columns[2], brain.weights, cursor);
}

function drawWeightBlock(fromColumn, toColumn, weights, startCursor) {
  let cursor = startCursor;
  for (const to of toColumn) {
    for (const from of fromColumn) {
      const weight = weights[cursor];
      const alpha = clamp(Math.abs(weight) / 2.2, 0.08, 0.75);
      brainCtx.strokeStyle = weight >= 0 ? `rgba(120, 208, 120, ${alpha})` : `rgba(236, 106, 94, ${alpha})`;
      brainCtx.lineWidth = 0.8 + Math.abs(weight) * 0.75;
      brainCtx.beginPath();
      brainCtx.moveTo(from.x, from.y);
      brainCtx.lineTo(to.x, to.y);
      brainCtx.stroke();
      cursor += 1;
    }
    cursor += 1;
  }
}

function drawBrainNeurons(columns, color) {
  for (const column of columns) {
    for (const neuron of column) {
      const activation = clamp((neuron.value + 1) / 2, 0, 1);
      brainCtx.fillStyle = mixColor('#17221f', color, activation);
      brainCtx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
      brainCtx.lineWidth = 1;
      brainCtx.beginPath();
      brainCtx.arc(neuron.x, neuron.y, 6.5, 0, Math.PI * 2);
      brainCtx.fill();
      brainCtx.stroke();

      if (neuron.label) {
        const alignRight = neuron.x < brainCanvas.width / 2;
        brainCtx.fillStyle = 'rgba(238, 247, 239, 0.62)';
        brainCtx.font = '10px Segoe UI, sans-serif';
        brainCtx.textAlign = alignRight ? 'left' : 'right';
        brainCtx.fillText(neuron.label, neuron.x + (alignRight ? 10 : -10), neuron.y + 3);
      }
    }
  }
}

function resizeBrainCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.floor(brainCanvas.clientWidth * ratio);
  const height = Math.floor(brainCanvas.clientHeight * ratio);
  if (brainCanvas.width !== width || brainCanvas.height !== height) {
    brainCanvas.width = width;
    brainCanvas.height = height;
  }
}

function getSelectedAnimal() {
  return world.animals.find((animal) => animal.id === world.selectedAnimalId) || null;
}

function selectAnimalAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const worldX = ((clientX - rect.left) / rect.width) * world.width;
  const worldY = ((clientY - rect.top) / rect.height) * world.height;
  let nearest = null;
  let nearestDistance = 90;
  for (const animal of world.animals) {
    const d = torusDistance(worldX, worldY, animal.x, animal.y);
    if (d < nearestDistance) {
      nearest = animal;
      nearestDistance = d;
    }
  }
  world.selectedAnimalId = nearest ? nearest.id : null;
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
  nextAnimalId = 1;
  world.day = 0;
  world.tick = 0;
  world.stepBudget = 0;
  world.endMode = endModeInput.value;
  world.targetGeneration = Number(targetGenerationInput.value);
  world.ended = false;
  world.endReason = '';
  world.populationHistory = [];
  world.collapseStarted = false;
  world.collapseStartTick = 0;
  world.running = true;
  world.plants = [];
  world.animals = [];
  world.particles = [];
  world.genealogyRecords = new Map();
  world.selectedAnimalId = null;
  world.climate = { rain: 0.55, light: 0.7, temperature: 0.62, storm: 0, drought: 0 };
  for (let i = 0; i < 430; i += 1) spawnPlant(Math.random() * world.width, Math.random() * world.height, randomBetween(10, 58));
  seedAnimals(1);
  world.selectedAnimalId = world.animals[0]?.id || null;
  toggleRunButton.textContent = 'Pause';
}

function animationLoop() {
  syncScenarioControls();
  syncSpeedControl();
  if (world.running && !world.ended) {
    world.stepBudget += world.speed;
    const iterations = Math.min(8, Math.floor(world.stepBudget));
    world.stepBudget -= iterations;
    for (let i = 0; i < iterations; i += 1) step();
  }
  draw();
  requestAnimationFrame(animationLoop);
}

function syncSpeedControl() {
  const speed = Number(speedInput.value);
  if (world.speed !== speed) {
    world.speed = speed;
    world.stepBudget = Math.min(world.stepBudget, Math.max(0, speed));
  }
  speedValueEl.textContent = `${world.speed.toFixed(2)}x`;
}

function syncScenarioControls() {
  targetGenerationValueEl.textContent = targetGenerationInput.value;
  world.targetGeneration = Number(targetGenerationInput.value);
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
  if (world.ended) {
    resetWorld();
    return;
  }
  world.running = !world.running;
  toggleRunButton.textContent = world.running ? 'Pause' : 'Reprendre';
});

resetButton.addEventListener('click', resetWorld);
canvas.addEventListener('click', (event) => {
  selectAnimalAt(event.clientX, event.clientY);
});
lineageListEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select-id]');
  if (!button) return;
  world.selectedAnimalId = Number(button.dataset.selectId);
});
speedInput.addEventListener('input', () => {
  syncSpeedControl();
});
climateStressInput.addEventListener('input', () => {
  world.climateStress = Number(climateStressInput.value);
});
endModeInput.addEventListener('change', () => {
  world.endMode = endModeInput.value;
  world.ended = false;
  world.endReason = '';
  world.populationHistory = [];
  world.collapseStarted = false;
  world.collapseStartTick = 0;
  toggleRunButton.textContent = world.running ? 'Pause' : 'Reprendre';
});
targetGenerationInput.addEventListener('input', () => {
  syncScenarioControls();
});

resetWorld();
animationLoop();
