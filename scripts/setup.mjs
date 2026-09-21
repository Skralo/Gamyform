import { readFile, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
if (!stdin.isTTY) {
  console.error("Run npm run setup in an interactive terminal.");
  process.exit(1);
}
async function secret(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  return new Promise((resolve, reject) => {
    const read = (b) => {
      for (const ch of b.toString()) {
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          process.exit(130);
        }
        if (ch === "\r" || ch === "\n") {
          stdin.off("data", read);
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u007f") {
          value = value.slice(0, -1);
        } else if (ch >= " ") {
          value += ch;
        }
      }
    };
    stdin.on("data", read);
  });
}
const password = await secret(
  "Choose your workspace password (12+ characters; hidden): ",
);
if (password.length < 12 || Buffer.byteLength(password) > 72) {
  console.error("Use at least 12 characters and no more than 72 UTF-8 bytes.");
  process.exit(1);
}
const again = await secret("Confirm password: ");
if (password !== again) {
  console.error("Passwords do not match.");
  process.exit(1);
}
let env;
try {
  env = await readFile(".env", "utf8");
} catch {
  env = await readFile(".env.example", "utf8");
}
const hash = await bcrypt.hash(password, 12);
env = /^OWNER_PASSWORD_HASH=.*$/m.test(env)
  ? env.replace(
      /^OWNER_PASSWORD_HASH=.*$/m,
      () => `OWNER_PASSWORD_HASH=${hash}`,
    )
  : env + `\nOWNER_PASSWORD_HASH=${hash}\n`;
await writeFile(".env", env, { mode: 0o600 });
console.log("Workspace password configured. Restart the server to use it.");
