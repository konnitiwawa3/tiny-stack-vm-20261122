import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Result = { bytes: Buffer; exitCode: number };

function run(program: Buffer, input: Buffer): Result {
  // Storing a result in the data stack wraps it to a signed 32-bit word.
  const data = new Int32Array(256);
  const returns = new Uint16Array(64);
  const memory = new Int32Array(256);
  const output = Buffer.allocUnsafe(65_536);
  let pc = 0;
  let depth = 0;
  let frames = 0;
  let consumed = 0;
  let written = 0;

  const stop = (exitCode: number): Result => ({
    bytes: output.subarray(0, written),
    exitCode,
  });

  for (let steps = 0; steps < 1_000_000; steps++) {
    if (pc < 0 || pc >= program.length) return stop(9);
    const op = program[pc++];

    switch (op) {
      case 0x00:
        return stop(0);

      case 0x01:
      case 0x02: {
        const width = op === 0x01 ? 1 : 4;
        if (pc + width > program.length) return stop(9);
        if (depth === data.length) return stop(3);
        data[depth++] = width === 1 ? program.readInt8(pc) : program.readInt32LE(pc);
        pc += width;
        break;
      }

      case 0x03:
        if (depth < 1) return stop(2);
        depth--;
        break;
      case 0x04:
        if (depth < 1) return stop(2);
        if (depth === data.length) return stop(3);
        data[depth] = data[depth - 1];
        depth++;
        break;
      case 0x05: {
        if (depth < 2) return stop(2);
        const top = data[depth - 1];
        data[depth - 1] = data[depth - 2];
        data[depth - 2] = top;
        break;
      }
      case 0x06:
        if (depth < 2) return stop(2);
        if (depth === data.length) return stop(3);
        data[depth] = data[depth - 2];
        depth++;
        break;
      case 0x07: {
        if (depth < 3) return stop(2);
        const bottom = data[depth - 3];
        data[depth - 3] = data[depth - 2];
        data[depth - 2] = data[depth - 1];
        data[depth - 1] = bottom;
        break;
      }

      case 0x17:
      case 0x1b: {
        if (depth < 1) return stop(2);
        const value = data[depth - 1];
        data[depth - 1] = op === 0x17 ? -value : ~value;
        break;
      }
      case 0x10: case 0x11: case 0x12: case 0x13:
      case 0x14: case 0x15: case 0x16:
      case 0x18: case 0x19: case 0x1a: case 0x1c:
      case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22: {
        if (depth < 2) return stop(2);
        const right = data[--depth];
        const left = data[depth - 1];
        if (op >= 0x13 && op <= 0x16 && right === 0) return stop(4);
        let result: number;
        switch (op) {
          case 0x10: result = left + right; break;
          case 0x11: result = left - right; break;
          case 0x12: result = Math.imul(left, right); break;
          case 0x13: result = Math.trunc(left / right); break;
          case 0x14: result = left % right; break;
          case 0x15: result = Math.trunc((left >>> 0) / (right >>> 0)); break;
          case 0x16: result = (left >>> 0) % (right >>> 0); break;
          case 0x18: result = left & right; break;
          case 0x19: result = left | right; break;
          case 0x1a: result = left ^ right; break;
          case 0x1c: result = left << right; break;
          case 0x1d: result = left >> right; break;
          case 0x1e: result = left >>> right; break;
          case 0x20: result = +(left === right); break;
          case 0x21: result = +(left < right); break;
          case 0x22: result = +((left >>> 0) < (right >>> 0)); break;
        }
        data[depth - 1] = result;
        break;
      }

      case 0x30:
      case 0x31:
      case 0x32: {
        if (pc + 2 > program.length) return stop(9);
        const offset = program.readInt16LE(pc);
        pc += 2;
        if (op === 0x30) {
          pc += offset;
        } else {
          if (depth < 1) return stop(2);
          const zero = data[--depth] === 0;
          if (zero === (op === 0x31)) pc += offset;
        }
        break;
      }
      case 0x33: {
        if (pc + 2 > program.length) return stop(9);
        if (frames === returns.length) return stop(7);
        returns[frames++] = pc + 2;
        pc = program.readUInt16LE(pc);
        break;
      }
      case 0x34:
        if (frames === 0) return stop(8);
        pc = returns[--frames];
        break;

      case 0x40:
      case 0x41: {
        if (depth < (op === 0x40 ? 1 : 2)) return stop(2);
        const address = data[depth - 1] >>> 0;
        if (address >= memory.length) return stop(6);
        if (op === 0x40) {
          data[depth - 1] = memory[address];
        } else {
          depth -= 2;
          memory[address] = data[depth];
        }
        break;
      }

      case 0x50: {
        if (depth < 1) return stop(2);
        const digits = String(data[--depth]);
        if (written + digits.length > output.length) return stop(11);
        written += output.write(digits, written, "ascii");
        break;
      }
      case 0x51:
        if (depth < 1) return stop(2);
        if (written === output.length) return stop(11);
        output[written++] = data[--depth] & 255;
        break;
      case 0x52:
        if (depth === data.length) return stop(3);
        data[depth++] = consumed < input.length ? input[consumed++] : -1;
        break;
      case 0x53:
        if (depth < 1) return stop(2);
        return stop(data[depth - 1] & 255);

      default:
        return stop(5);
    }
  }
  return stop(10);
}

for (let index = 1; index <= 40; index++) {
  const id = "i" + String(index).padStart(3, "0");
  const program = readFileSync(`/input/${id}/program.bin`);
  const input = readFileSync(`/input/${id}/input.bin`);
  const { bytes, exitCode } = run(program, input);
  const directory = `/output/${id}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(`${directory}/stdout.bin`, bytes);
  writeFileSync(`${directory}/exit.txt`, String(exitCode) + "\n");
}
