const path = require('path');
const {workerData} = require('worker_threads');

require(path.join(__dirname, 'require-hook.js'));

process.on('uncaughtException', (error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
});

try {
    require(workerData.testPath);
} catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
}
