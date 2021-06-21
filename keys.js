const { whisper } = require('@dawaltconley/cue');
const keytar = require('keytar');
const path = require('path');

const app = require(path.join(__dirname, 'package.json')).name;
const defaultService = 'api.propublica.org';

const keys = {
    propublica: {
        service: 'api.propublica.org',
        name: 'ProPublica API Key:',
        error: `${app} requires a ProPublica API key; you can request one from https://www.propublica.org/datastore/api/propublica-congress-api`
    }
};

const promptKey = async k => {
    let { service, name, error } = keys[k];
    let key = await whisper(name);
    if (!key)
        throw new Error(error);
    return await keytar.setPassword(service, app, key);
};

const getKey = async k => {
    let { service } = keys[k];
    let key = await keytar.findPassword(service);
    if (!key) {
        console.warn(`Couldn't find key for ${service}. Please enter manually.`);
        await promptKey(service);
    }
    return key;
};

module.exports = {
    get: getKey,
    prompt: promptKey
};
