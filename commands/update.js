const fs = require('fs');
const path = require('path');
const ProPublica = require(path.join(__dirname, '..', 'propublica.js'));
const keys = require(path.join(__dirname, '..', 'keys.js'));

exports.command = 'update';

exports.describe = 'refresh local cache of congressmembers';

exports.builder = {
    force: {
        describe: 'force a full refresh of the local cache',
        type: 'boolean'
    },
    congress: {
        describe: 'congress to use when pulling members and searching for bills',
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
        fs.unlinkSync(this.memberCache());
    return pp.updateMems({ aggressive: true });
};
