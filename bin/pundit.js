#!/usr/bin/env node
// Entry point for the `pundit` command. Registers tsx so the TypeScript CLI runs without a build step.
import { register } from "tsx/esm/api";

register();
await import("../src/cli/main.ts");
