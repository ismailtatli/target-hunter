# Target Hunter

**Target Hunter** is a browser-based 2D arcade shooting game developed as a **Computer Graphics Final Project** for Spring 2026.

The game is built with **HTML5 Canvas**, **CSS**, and **JavaScript**. It includes real-time animation, mouse interaction, collision detection, scoring, combo mechanics, level progression, multiple target types, and visual effects.

## Live Demo

https://ismailtatli.github.io/target-hunter/

## Repository

https://github.com/ismailtatli/target-hunter

## Project Overview

Target Hunter is a complete playable arcade-style aim training game. The player controls a crosshair, shoots enemy targets, avoids civilians, collects bonus targets, and tries to achieve the highest possible score before the timer ends or all lives are lost.

The game includes:

- Start screen
- Active gameplay
- Pause system
- Game over screen
- Scoring system
- Combo system
- Level progression
- Increasing difficulty
- Multiple animated target types
- Visual effects

## Target Types

| Target | Effect |
|---|---|
| Green Enemy | Gives `+10 × combo` points |
| Red Civilian | Removes one life, decreases score, and resets combo |
| Orange Elite | Gives `+50 × combo` points |
| Blue Chrono | Adds extra time and points |
| Ice Crystal | Freezes all targets for 3 seconds |

## Game Rules

- Combo increases from `×1` up to `×8`.
- The player must hit another valid target within `2 seconds` to keep the combo active.
- Missing, hitting a civilian, letting an enemy escape, or waiting too long resets combo.
- Every `300 points` increases the level.
- Higher levels increase target speed, target pressure, and difficulty.
- The game ends when time reaches zero or all lives are lost.

## Controls

| Control | Action |
|---|---|
| Mouse Move | Aim |
| Mouse Click | Shoot |
| Space | Pause / Resume |

## Computer Graphics Concepts

This project demonstrates several computer graphics concepts:

- HTML5 Canvas rendering
- Real-time animation loop with `requestAnimationFrame()`
- 2D transformations such as `translate()`, `rotate()`, and `scale()`
- Mouse-based interaction
- Collision detection
- Particle effects
- Gradients, shadows, and glow effects
- Game state management
