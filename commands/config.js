const path = require('path');
const keys = require(path.join(__dirname, '..', 'keys.js'));

exports.command = 'config';

exports.describe = 'setup using API keys';

exports.builder = {};

exports.handler = () => keys.prompt('propublica');
