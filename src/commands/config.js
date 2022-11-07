const keys = require('../keys');

exports.command = 'config';

exports.describe = 'set up using API keys';

exports.builder = {};

exports.handler = () => keys.prompt('propublica');
