/*
 * This should have the following methods:
 * 1. Specify a number of bills, automatically search all mems of congress for
 *    the result of whatever the most recent action was
 *      - maybe, if it doesn't increase api calls, just get info on one bill at a time
 * 2. Get latest members
 * 3. Configure (profide api key)
 *
 * Main problems with the last one:
 * 1. couldn't find votes on specific ammendments or other actions
 * 2. slow, used many syncronous API calls, had to store data in local storage
 * 3. very specific to usage by DSA, didn't include MOCs without DSA chapters in district
 * 4. hardcoded things like congressional session, hard to automatically update MOCs on new session
 *
 * will take an opts object argument with the following options:
 * - key (also configurable in an instance)
 * - cosponsors (array of bill names)
 * - votes (array of bill names (last vote or vote to pass) or roll call numbers)
 * - *if* it can narrow the ammount of queries made, various fields to filter members
 */

const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

yargs(hideBin(process.argv))
    .alias('help', 'h')
    .commandDir(path.join(__dirname, 'commands'))
    .argv;
