# Tiny Stack VM

An interpreter for the tiny stack ISA v1, written for Node.js 22 with its built-in modules.

Run `node main.ts` with the case files mounted under `/input`. Results go to `/output`.

The runner handles `i001` through `i040` in one invocation. Each case reads
`program.bin` and `input.bin` and writes its own `stdout.bin` and `exit.txt`.
The interpreter starts each case with empty stacks and zeroed memory and
preserves bytes already written if an instruction traps.

From the unpacked official kit, run
`node cli/makefun.mjs grade-local --kit . --bot /path/to/entry --driver docker`
to grade the public practice set.
