# ADNeuroGaia

ADNeuroGaia is a browser-based ecosystem simulation rendered with HTML Canvas.

The first prototype models a small evolving world with:

- plants that grow according to light, rain, temperature, fertility, and local pressure;
- herbivores that search for plants, flee predators, consume energy, and reproduce;
- herbivores that can evolve defensive traits such as camouflage, armor, energy absorption, and herd behavior;
- carnivores that hunt prey, compete, can mutate toward cannibalism, and mutate across generations;
- omnivores that can opportunistically eat plants or animals;
- a tiny neural network per animal, inherited with mutation at reproduction;
- a navigable genealogy view to move through ancestors, descendants, and mutation deltas;
- changing climate cycles, storms, droughts, and seasonal variation;
- live metrics for population, generation, biomass, and climate.

## Run locally

Open `index.html` in a browser. No build step is required.

## Publish with GitHub Pages

This project is static. In the GitHub repository settings, enable GitHub Pages from the `main` branch and the repository root.

## Simulation notes

The goal is not biological realism yet. The current model is intentionally compact so we can observe emergent dynamics, tune parameters, and later add richer evolution: species lineages, memory, terrain, disease, genome visualization, or selectable individuals.

See `docs/nature-notes.md` for the living design notes that connect future simulation traits to ideas inspired by nature.
