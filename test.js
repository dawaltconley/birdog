const { prompt, whisper } = require('@dawaltconley/cue');
const keytar = require('keytar');
const TrackMOC = require('./index.js');

const getKey = async (service='api.propublica.org') => {
    let key = await keytar.findPassword(service);
    if (!key) {
        console.log(`Couldn't find key for ${service}. Please enter manually.`);
        let account = await prompt('Account:');
        key = await whisper('API Key:');
        await keytar.setPassword(service, account, key);
    }
    return key;
};

getKey().then(async key => {
    const tracker = new TrackMOC({ key: key });
    const members = await tracker.updateMems();
    console.log(members);
});
