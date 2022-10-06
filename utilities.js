const limitAsync = async (tasks, n) => {
    const results = new Array(tasks.length);
    const executing = [];
    let index = 0;
    while (index < tasks.length || executing.length) {
        if (index < tasks.length && executing.length < n) {
            let task = tasks[index];
            let taskIndex = index;
            task = task().then(r => {
                const i = executing.indexOf(task);
                executing.splice(i, 1);
                results[taskIndex] = r;
            });
            executing.push(task);
            index++;
        } else {
            await Promise.race(executing);
        }
    }
    return results;
};

module.exports = { limitAsync };
