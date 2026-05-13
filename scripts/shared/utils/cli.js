/**
 * Parses command line arguments into an object
 * Example: --did abc --key 123 => { did: 'abc', key: '123' }
 */
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i].startsWith("--")) {
      const key = process.argv[i].slice(2);
      const value = process.argv[i + 1];
      args[key] = value;
      i++;
    }
  }
  return args;
}

/**
 * Outputs success message to stdout
 */
function outputSuccess(data, exit = false) {
  console.log(JSON.stringify({ status: "success", data: data }, null, 2));
  if (exit) process.exit(0);
}

/**
 * Outputs error message to stdout and optionally exits the process
 */
function outputError(error, exit = false) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ status: "failed", data: message }, null, 2));
  if (exit) process.exit(1);
}

function outputInputRequired(data, exit = false) {
  console.log(JSON.stringify({ status: "input_required", data }, null, 2));
  if (exit) process.exit(0);
}

function urlFormatting(title, url) {
  return `[${title}](${url})`;
}

module.exports = {
  parseArgs,
  outputSuccess,
  outputError,
  outputInputRequired,
  urlFormatting,
};
