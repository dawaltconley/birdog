const fs = require('fs');
const path = require('path');
const ProPublica = require(path.join(__dirname, '..', 'propublica.js'));
const keys = require(path.join(__dirname, '..', 'keys.js'));

exports.command = 'update';

exports.describe = 'refresh local cache of congressmembers';

exports.builder = {
    force: {
        describe: 'delete the local cache before updating',
        type: 'boolean'
    },
    congress: {
        describe: 'congress to use when pulling members',
        type: 'number',
        nargs: 1,
        default: ProPublica.guessSession().congress,
        requiresArg: true
    }
};

exports.handler = async argv => {
    const pp = new ProPublica({
        key: await keys.get('propublica'),
        congress: argv.congress
    });
    if (argv.force)
        await pp.repsCache.delete();
    return pp.updateMems({ aggressive: true });
};
