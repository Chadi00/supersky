# Supersky

Supersky is a coding agent harness inspired by [pi.dev](https://pi.dev).

The core idea is simple:

- keep the harness tiny
- keep the agent loop clean
- keep the tool surface minimal
- push advanced power-user features outside the core

Supersky should feel like **pi at the core**, but offer a much more powerful environment around that core.

## Vision

Most coding agent projects get heavier over time: larger prompts, more tools, more orchestration, more layers of abstraction, and more places for reliability to break down.

Supersky takes the opposite approach.

The base harness should remain extremely minimal and understandable:

- a very short system prompt
- only 4 tools: `read`, `edit`, `write`, and `bash`
- a lightweight, reliable agent loop
- simple codepaths that are easy to inspect and debug

The goal is **not** to compete by making the base agent more complex.
The goal is to build a better environment for using that agent.

## Core Philosophy

### 1. Minimal harness
The harness should stay small, fast, and easy to reason about.

### 2. Strong defaults
The default experience should be reliable without requiring prompt engineering or complex configuration.

### 3. Powerful environment
Advanced functionality should live around the harness, not inside it.

### 4. Forkable workflows
Users should be able to checkpoint, rewind, branch, compare, and share agent sessions naturally.

### 5. Built for power users
Supersky should support serious iterative workflows: experimentation, evals, recovery, collaboration, and reproducibility.

## What Makes Supersky Different

The main differentiation is not the core loop itself.
It is the surrounding system.

Planned feature areas include:

- **Branching and checkpoints** — save progress, branch from any point, and explore alternatives safely
- **Rewind / fork workflows** — go back in time, retry from earlier states, and compare outcomes
- **Cloud sessions** — continue work from anywhere with persistent remote state
- **Sharing and realtime collaboration** — collaborate on sessions, inspect changes, and hand off work
- **Export / import** — move sessions and artifacts between local and cloud environments
- **Stronger context management** — better control over what the agent sees and remembers
- **Tests and evals workflows** — run repeatable verification and benchmark agent behavior over time

## Design Principles

- **Keep the core boring**
  - short prompt
  - minimal tools
  - predictable behavior
  - easy debugging

- **Add power at the edges**
  - session management
  - history and replay
  - collaboration
  - cloud sync
  - eval infrastructure

- **Optimize for clarity over cleverness**
  - readable code
  - small abstractions
  - explicit state transitions

- **Make experimentation safe**
  - checkpoints
  - branching
  - reversible actions
  - reproducible runs

## Non-Goals

Supersky is not trying to become:

- a bloated autonomous framework
- a giant prompt-engineering playground
- a kitchen-sink tool host with dozens of built-ins
- a complex replacement for the simplicity that makes pi effective


## Summary

Supersky is a minimal coding agent harness with a maximal focus on workflow power.

If pi showed that a coding agent can be effective with a tiny core, Supersky aims to prove that you can keep that core intact while building a dramatically more capable environment around it.
