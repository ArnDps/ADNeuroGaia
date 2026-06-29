# Nature-inspired design notes

ADNeuroGaia is an exploratory simulation, not a biological model. This file captures ideas inspired by nature so each version can turn one observed strategy into a small testable rule.

## Herbivore defense traits

- Camouflage: lowers predator detection and capture probability, at a small metabolic cost.
- Armor: lowers capture probability, but reduces maximum speed and costs more energy.
- Energy absorption: improves energy gained from plants, allowing stronger reproduction or recovery.
- Gregariousness: pulls herbivores toward nearby herbivores and increases group defense when several are close.

## Future directions

- Warning signals: one prey detects a predator and nearby prey react faster.
- Herd geometry: individuals at the edge of a group are more vulnerable than individuals inside.
- Mobbing behavior: groups can repel predators at high risk and energy cost.
- Seasonal coats or coloration: camouflage adapts to vegetation density and climate.
- Horns, antlers, shells, toxins, speed bursts, and vigilance as separate heritable tradeoffs.
- Predator counter-adaptation: better vision, ambush, endurance, or pack hunting.

## Carnivore pressure traits

- Cannibalism: carnivores can mutate toward eating other carnivores when hungry. It can help survival during prey scarcity, but attacks are risky and the trait carries metabolic and reproductive costs.

## Modeling rule

Every new trait should have a benefit and a cost. If a trait is only beneficial, it will dominate too quickly and reduce evolutionary diversity.
