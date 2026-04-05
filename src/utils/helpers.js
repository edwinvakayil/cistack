'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

function banner() {
  console.log('\n' + chalk.bold.cyan('  ██████╗██╗███████╗██╗      ██████╗ ██╗    ██╗'));
  console.log(chalk.bold.cyan('  ██╔════╝██║██╔════╝██║     ██╔═══██╗██║    ██║'));
  console.log(chalk.bold.cyan('  ██║     ██║█████╗  ██║     ██║   ██║██║ █╗ ██║'));
  console.log(chalk.bold.cyan('  ██║     ██║██╔══╝  ██║     ██║   ██║██║███╗██║'));
  console.log(chalk.bold.cyan('  ╚██████╗██║██║     ███████╗╚██████╔╝╚███╔███╔╝'));
  console.log(chalk.bold.cyan('   ╚═════╝╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝ '));
  console.log('');
  console.log('  ' + chalk.dim('GitHub Actions pipeline generator'));
  console.log('  ' + chalk.dim('─'.repeat(44)));
  console.log('');
}

module.exports = { ensureDir, writeFile, banner };
