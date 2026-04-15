const readline = require("node:readline/promises");
const { stdin: input, stdout: output } = require("node:process");

const { addPost } = require("./db");

async function getContentFromCli() {
  const argContent = process.argv.slice(2).join(" ").trim();
  if (argContent) {
    return argContent;
  }

  if (!process.stdin.isTTY) {
    return "";
  }

  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question("Enter LinkedIn post content:\n")).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const content = await getContentFromCli();

  if (!content) {
    console.error("[add-post] Content is empty. Usage: node add-post.js \"Your content\"");
    process.exitCode = 1;
    return;
  }

  const result = addPost(content);
  console.log(`[add-post] Added pending post with id ${result.lastInsertRowid}.`);
}

if (require.main === module) {
  main();
}
